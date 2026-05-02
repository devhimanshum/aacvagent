import axios from 'axios';
import type { OutlookEmail, EmailAttachment } from '@/types';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL  = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

function getOutlookConfig() {
  const clientId     = process.env.OUTLOOK_CLIENT_ID     || '';
  const tenantId     = process.env.OUTLOOK_TENANT_ID     || '';
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET || '';
  const inboxEmail   = process.env.OUTLOOK_INBOX_EMAIL   || '';

  if (!clientId || !tenantId || !clientSecret || !inboxEmail) {
    const missing = [
      !clientId     && 'OUTLOOK_CLIENT_ID',
      !tenantId     && 'OUTLOOK_TENANT_ID',
      !clientSecret && 'OUTLOOK_CLIENT_SECRET',
      !inboxEmail   && 'OUTLOOK_INBOX_EMAIL',
    ].filter(Boolean).join(', ');
    throw new Error(
      `Outlook is not configured. Missing: ${missing}. ` +
      'Add these in Vercel → Project Settings → Environment Variables, then redeploy.',
    );
  }
  return { clientId, tenantId, clientSecret, inboxEmail };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;

  const { clientId, tenantId, clientSecret } = getOutlookConfig();
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
        throw new Error('Outlook auth failed: invalid client ID or secret. Check OUTLOOK_CLIENT_ID and OUTLOOK_CLIENT_SECRET in Vercel dashboard.');
      if (error === 'unauthorized_client')
        throw new Error('Outlook auth failed: client not authorised. Ensure admin consent is granted in Azure Portal.');
      throw new Error(`Outlook token error (${error}): ${desc}`);
    }
    throw err;
  }
}

function handleGraphError(err: unknown, inboxEmail: string): never {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const code   = err.response?.data?.error?.code;
    const msg    = err.response?.data?.error?.message || '';
    console.error(`[Graph ${status}] ${code}: ${msg}`);
    if (status === 404) throw new Error(`Mailbox not found: "${inboxEmail}". Check OUTLOOK_INBOX_EMAIL is the correct shared/user mailbox.`);
    if (status === 401) throw new Error('Outlook token invalid — check OUTLOOK_CLIENT_ID, OUTLOOK_TENANT_ID, OUTLOOK_CLIENT_SECRET in Vercel dashboard.');
    if (status === 403) throw new Error(`Access denied to "${inboxEmail}". Grant Mail.Read (Application) permission and admin consent in Azure Portal → API Permissions.`);
    if (status === 400) throw new Error(`Bad request to Graph API (${code}): ${msg}`);
    if (code)           throw new Error(`Microsoft Graph error (${code}): ${msg}`);
    throw new Error(`Graph API error ${status}: ${msg}`);
  }
  throw err;
}

// ── Fetch all inbox emails ────────────────────────────────────
export async function fetchAllEmails(maxEmails = 50): Promise<OutlookEmail[]> {
  const { inboxEmail } = getOutlookConfig();
  const token = await getAccessToken();
  try {
    const res = await axios.get(`${GRAPH_BASE}/users/${inboxEmail}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        $top:     maxEmails,
        $orderby: 'receivedDateTime desc',
        $select:  'id,subject,from,toRecipients,receivedDateTime,hasAttachments,isRead,bodyPreview,importance,isDraft',
      },
    });
    return (res.data.value || []) as OutlookEmail[];
  } catch (err) { handleGraphError(err, inboxEmail); }
}

// ── Fetch single email with full body ─────────────────────────
export async function fetchEmailById(
  emailId: string,
): Promise<OutlookEmail & { body: { content: string; contentType: string } }> {
  const { inboxEmail } = getOutlookConfig();
  const token = await getAccessToken();
  const encodedId = encodeURIComponent(emailId);
  try {
    const res = await axios.get(
      `${GRAPH_BASE}/users/${inboxEmail}/messages/${encodedId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params:  { $select: 'id,subject,from,toRecipients,receivedDateTime,hasAttachments,isRead,bodyPreview,body,importance' },
      },
    );
    return res.data;
  } catch (err) { handleGraphError(err, inboxEmail); }
}

// ── Fetch emails with attachments ─────────────────────────────
export async function fetchEmailsWithAttachments(maxEmails = 50): Promise<OutlookEmail[]> {
  const { inboxEmail } = getOutlookConfig();
  const token = await getAccessToken();
  const res = await axios.get(`${GRAPH_BASE}/users/${inboxEmail}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      $filter:  'hasAttachments eq true',
      $top:     maxEmails,
      $orderby: 'receivedDateTime desc',
      $select:  'id,subject,from,receivedDateTime,hasAttachments,isRead,bodyPreview',
    },
  });
  return (res.data.value || []) as OutlookEmail[];
}

// ── Fetch attachment list ─────────────────────────────────────
export async function fetchEmailAttachments(emailId: string): Promise<EmailAttachment[]> {
  const { inboxEmail } = getOutlookConfig();
  const token = await getAccessToken();
  const encodedId = encodeURIComponent(emailId);
  try {
    const res = await axios.get(
      `${GRAPH_BASE}/users/${inboxEmail}/messages/${encodedId}/attachments`,
      { headers: { Authorization: `Bearer ${token}` }, params: { $select: 'id,name,contentType,size' } },
    );
    return (res.data.value || []) as EmailAttachment[];
  } catch (err) { handleGraphError(err, inboxEmail); }
}

// ── Download a single attachment ──────────────────────────────
export async function downloadAttachment(
  emailId: string, attachmentId: string,
): Promise<{ buffer: Buffer; contentType: string; name: string }> {
  const { inboxEmail } = getOutlookConfig();
  const token = await getAccessToken();
  const encodedId = encodeURIComponent(emailId);
  const res = await axios.get(
    `${GRAPH_BASE}/users/${inboxEmail}/messages/${encodedId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const att = res.data as EmailAttachment;
  if (!att.contentBytes) throw new Error('Attachment has no content');
  return { buffer: Buffer.from(att.contentBytes, 'base64'), contentType: att.contentType, name: att.name };
}

export async function validateOutlookConnection(): Promise<{ ok: boolean; error?: string }> {
  try { await getAccessToken(); return { ok: true }; }
  catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }; }
}

export function isOutlookConfigured(): boolean {
  return !!(
    process.env.OUTLOOK_CLIENT_ID &&
    process.env.OUTLOOK_TENANT_ID &&
    process.env.OUTLOOK_CLIENT_SECRET &&
    process.env.OUTLOOK_INBOX_EMAIL
  );
}
