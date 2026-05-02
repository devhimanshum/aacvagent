import axios from 'axios';
import type { OutlookEmail, EmailAttachment } from '@/types';
import { getOutlookSettings } from '@/lib/firebase/integration-settings';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL  = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

// Fields fetched for every email in a list view
const EMAIL_LIST_SELECT =
  'id,subject,from,toRecipients,receivedDateTime,hasAttachments,isRead,bodyPreview,importance,isDraft';

async function getOutlookConfig() {
  const stored = await getOutlookSettings();
  if (stored) return stored;

  const clientId     = process.env.OUTLOOK_CLIENT_ID     || '';
  const tenantId     = process.env.OUTLOOK_TENANT_ID     || '';
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET || '';
  const inboxEmail   = process.env.OUTLOOK_INBOX_EMAIL   || '';

  if (clientId && tenantId && clientSecret && inboxEmail) {
    return { clientId, tenantId, clientSecret, inboxEmail };
  }

  throw new Error(
    'Outlook is not configured. Go to Settings → Connections and enter your Outlook credentials.',
  );
}

// ── Token cache ───────────────────────────────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;

  const { clientId, tenantId, clientSecret } = await getOutlookConfig();
  const params = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         'https://graph.microsoft.com/.default',
    grant_type:    'client_credentials',
  });

  try {
    const res = await axios.post<{ access_token: string; expires_in: number }>(
      TOKEN_URL(tenantId), params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    cachedToken = { token: res.data.access_token, expiresAt: now + res.data.expires_in * 1000 };
    return cachedToken.token;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const error = err.response?.data?.error;
      const desc  = err.response?.data?.error_description || '';
      if (error === 'invalid_client')
        throw new Error('Outlook auth failed — invalid Client ID or Secret. Check your credentials in Settings.');
      if (error === 'unauthorized_client')
        throw new Error('Outlook auth failed — admin consent not granted. Go to Azure Portal → API Permissions.');
      throw new Error(`Outlook token error (${error}): ${desc}`);
    }
    throw err;
  }
}

export function invalidateOutlookTokenCache() {
  cachedToken = null;
}

// ── Error handler ─────────────────────────────────────────────
function handleGraphError(err: unknown, inboxEmail: string): never {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const code   = err.response?.data?.error?.code;
    const msg    = err.response?.data?.error?.message || '';
    if (status === 404) throw new Error(`Mailbox not found: "${inboxEmail}". Check the inbox email in Settings.`);
    if (status === 401) throw new Error('Outlook token invalid — check Client ID, Tenant ID, and Secret in Settings.');
    if (status === 403) throw new Error(`Access denied to "${inboxEmail}". Grant Mail.Read (Application) permission in Azure Portal.`);
    if (code)           throw new Error(`Microsoft Graph error (${code}): ${msg}`);
    throw new Error(`Graph API error ${status}: ${msg}`);
  }
  throw err;
}

// ── Paginated single-page fetch ───────────────────────────────
// cursor = the full @odata.nextLink URL returned by the previous call.
// Returns the page of emails, the next cursor (null = no more pages),
// and the total email count (only present on the first page).
export async function fetchEmailsPage(
  cursor: string | null = null,
  limit = 50,
): Promise<{ emails: OutlookEmail[]; nextCursor: string | null; total: number | null }> {
  const { inboxEmail } = await getOutlookConfig();
  const token = await getAccessToken();

  try {
    // When cursor is present it IS the full next-link URL — use it as-is.
    // On first page build the URL with all query params + $count.
    const url = cursor ?? `${GRAPH_BASE}/users/${encodeURIComponent(inboxEmail)}/messages`;

    const res = await axios.get<{
      value: OutlookEmail[];
      '@odata.nextLink'?: string;
      '@odata.count'?: number;
    }>(url, {
      headers: {
        Authorization:    `Bearer ${token}`,
        ConsistencyLevel: 'eventual', // required for $count
      },
      // Only pass params on the first request; nextLink already has them
      params: cursor ? undefined : {
        $top:     Math.min(limit, 999),
        $orderby: 'receivedDateTime desc',
        $select:  EMAIL_LIST_SELECT,
        $count:   'true',
      },
    });

    return {
      emails:     res.data.value ?? [],
      nextCursor: res.data['@odata.nextLink'] ?? null,
      total:      res.data['@odata.count']    ?? null,
    };
  } catch (err) {
    handleGraphError(err, inboxEmail);
  }
}

// ── Fetch ALL emails (follows every nextLink page) ────────────
// Hard ceiling of 5 000 to prevent runaway loops on huge mailboxes.
export async function fetchAllEmails(maxEmails = 5000): Promise<OutlookEmail[]> {
  const all: OutlookEmail[] = [];
  let cursor: string | null = null;

  do {
    const { emails, nextCursor } = await fetchEmailsPage(cursor, 999);
    all.push(...emails);
    cursor = nextCursor;
  } while (cursor && all.length < maxEmails);

  return all.slice(0, maxEmails);
}

// ── Fetch emails with attachments (follows nextLinks) ─────────
export async function fetchEmailsWithAttachments(maxEmails = 5000): Promise<OutlookEmail[]> {
  const { inboxEmail } = await getOutlookConfig();
  const token = await getAccessToken();

  const all: OutlookEmail[] = [];
  let url: string | null =
    `${GRAPH_BASE}/users/${encodeURIComponent(inboxEmail)}/messages`;
  let isFirst = true;

  try {
    while (url && all.length < maxEmails) {
      type PageShape = { value: OutlookEmail[]; '@odata.nextLink'?: string };
      const page: { data: PageShape } = await axios.get<PageShape>(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: isFirst ? {
          $filter:  'hasAttachments eq true',
          $top:     999,
          $orderby: 'receivedDateTime desc',
          $select:  'id,subject,from,receivedDateTime,hasAttachments,isRead,bodyPreview',
        } : undefined,
      });
      all.push(...(page.data.value ?? []));
      url     = page.data['@odata.nextLink'] ?? null;
      isFirst = false;
    }
    return all.slice(0, maxEmails);
  } catch (err) {
    handleGraphError(err, inboxEmail);
  }
}

// ── Single email detail ───────────────────────────────────────
export async function fetchEmailById(
  emailId: string,
): Promise<OutlookEmail & { body: { content: string; contentType: string } }> {
  const { inboxEmail } = await getOutlookConfig();
  const token = await getAccessToken();
  const encodedId = encodeURIComponent(emailId);
  try {
    const res = await axios.get(
      `${GRAPH_BASE}/users/${encodeURIComponent(inboxEmail)}/messages/${encodedId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params:  {
          $select: 'id,subject,from,toRecipients,receivedDateTime,hasAttachments,isRead,bodyPreview,body,importance',
        },
      },
    );
    return res.data;
  } catch (err) { handleGraphError(err, inboxEmail); }
}

// ── Attachments ───────────────────────────────────────────────
export async function fetchEmailAttachments(emailId: string): Promise<EmailAttachment[]> {
  const { inboxEmail } = await getOutlookConfig();
  const token = await getAccessToken();
  const encodedId = encodeURIComponent(emailId);
  try {
    const res = await axios.get(
      `${GRAPH_BASE}/users/${encodeURIComponent(inboxEmail)}/messages/${encodedId}/attachments`,
      { headers: { Authorization: `Bearer ${token}` }, params: { $select: 'id,name,contentType,size' } },
    );
    return (res.data.value || []) as EmailAttachment[];
  } catch (err) { handleGraphError(err, inboxEmail); }
}

export async function downloadAttachment(
  emailId: string, attachmentId: string,
): Promise<{ buffer: Buffer; contentType: string; name: string }> {
  const { inboxEmail } = await getOutlookConfig();
  const token = await getAccessToken();
  const encodedId = encodeURIComponent(emailId);
  const res = await axios.get(
    `${GRAPH_BASE}/users/${encodeURIComponent(inboxEmail)}/messages/${encodedId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const att = res.data as EmailAttachment;
  if (!att.contentBytes) throw new Error('Attachment has no content');
  return { buffer: Buffer.from(att.contentBytes, 'base64'), contentType: att.contentType, name: att.name };
}

// ── Health checks ─────────────────────────────────────────────
export async function validateOutlookConnection(): Promise<{ ok: boolean; error?: string }> {
  try { await getAccessToken(); return { ok: true }; }
  catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }; }
}

export async function isOutlookConfigured(): Promise<boolean> {
  try {
    const stored = await getOutlookSettings();
    if (stored) return true;
    return !!(process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_TENANT_ID &&
              process.env.OUTLOOK_CLIENT_SECRET && process.env.OUTLOOK_INBOX_EMAIL);
  } catch { return false; }
}
