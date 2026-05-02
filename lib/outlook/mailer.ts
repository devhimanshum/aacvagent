import axios from 'axios';
import { getAccessToken } from './client';
import { getOutlookSettings } from '@/lib/firebase/integration-settings';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
  toName?: string;
}): Promise<void> {
  const token = await getAccessToken();
  const stored = await getOutlookSettings();
  const inboxEmail = stored?.inboxEmail || process.env.OUTLOOK_INBOX_EMAIL || '';
  if (!inboxEmail) throw new Error('Outlook inbox email not configured.');

  // Wrap plain text in HTML so newlines render properly
  const htmlBody = `<div style="font-family:inherit;white-space:pre-wrap">${opts.body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  }</div>`;

  try {
    await axios.post(
      `${GRAPH_BASE}/users/${encodeURIComponent(inboxEmail)}/sendMail`,
      {
        message: {
          subject: opts.subject,
          body: { contentType: 'HTML', content: htmlBody },
          toRecipients: [
            { emailAddress: { address: opts.to, name: opts.toName ?? opts.to } },
          ],
        },
        saveToSentItems: true,
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const msg    = err.response?.data?.error?.message ?? '';
      if (status === 403) throw new Error('Outlook lacks Mail.Send permission — add it in Azure Portal → API Permissions.');
      if (status === 404) throw new Error(`Mailbox not found: "${inboxEmail}". Check Outlook settings.`);
      throw new Error(`Send failed (${status}): ${msg}`);
    }
    throw err;
  }
}
