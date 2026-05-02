/**
 * Google Sheets integration.
 *
 * Uses the Firebase Admin service-account credentials (already in env)
 * to write rows into a user-supplied Google Sheet.
 *
 * Setup (one-time, done by the user):
 *   1. Open your Google Sheet → Share
 *   2. Add  firebase-adminsdk-fbsvc@cv-agent-cfac1.iam.gserviceaccount.com  as Editor
 *   3. Paste the sheet URL in Settings → Google Sheet
 *
 * Also ensure "Google Sheets API" is enabled in Google Cloud Console for
 * the cv-agent-cfac1 project.
 */

import { google } from 'googleapis';
import { getSheetSettings } from '@/lib/firebase/integration-settings';

// ── Extract spreadsheet ID from any Google Sheet URL ─────────
export function extractSheetId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const clean = urlOrId.trim();

  // Already looks like a raw ID (no slashes)
  if (/^[a-zA-Z0-9_-]{30,}$/.test(clean)) return clean;

  // https://docs.google.com/spreadsheets/d/<ID>/...
  const match = clean.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// ── Build an authenticated Sheets client ─────────────────────
async function getSheetsClient() {
  const rawKey      = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/^["']|["']$/g, '');
  const privateKey  = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '';

  if (!privateKey || !clientEmail) {
    throw new Error(
      'Firebase Admin credentials not found in environment. ' +
      'FIREBASE_ADMIN_PRIVATE_KEY and FIREBASE_ADMIN_CLIENT_EMAIL must be set.',
    );
  }

  const auth = new google.auth.JWT({
    email:  clientEmail,
    key:    privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// ── Column headers written on the first call ─────────────────
const HEADERS = [
  'Timestamp',
  'Name',
  'Email',
  'Phone',
  'Current Rank',
  'Total Sea Service',
  'Rank Experience Summary',
  'Education',
  'Email Subject',
  'Sender Email',
  'CV File',
  'Review Status',
];

// ── Ensure the header row exists (idempotent) ─────────────────
async function ensureHeaders(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'A1:L1',
  });
  const firstRow = res.data.values?.[0] ?? [];
  if (firstRow.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'A1:L1',
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

// ── Test connection & permissions ────────────────────────────
export async function testSheetConnection(
  sheetUrl: string,
): Promise<{ ok: boolean; message: string }> {
  const spreadsheetId = extractSheetId(sheetUrl);
  if (!spreadsheetId) {
    return {
      ok: false,
      message:
        '❌ Invalid URL — make sure you paste a Google Sheets URL ' +
        '(docs.google.com/spreadsheets/d/…)',
    };
  }

  try {
    const sheets = await getSheetsClient();
    const res    = await sheets.spreadsheets.get({ spreadsheetId });
    const title  = res.data.properties?.title ?? 'Untitled';
    return { ok: true, message: `✅ Connected to sheet: "${title}"` };
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string; errors?: { reason?: string; message?: string }[] };
    // Always log the full error so it's visible in server logs
    console.error('[Google Sheet] testSheetConnection error:', JSON.stringify({
      code:    e?.code,
      message: e?.message,
      errors:  e?.errors,
    }));

    const msg = String(e?.message ?? '');

    // ── Check message content BEFORE code (both disabled-API and no-share return 403) ──
    if (
      msg.includes('Sheets API has not been used') ||
      msg.includes('is disabled') ||
      e?.errors?.[0]?.reason === 'accessNotConfigured'
    ) {
      return {
        ok: false,
        message:
          '❌ Google Sheets API is not enabled. ' +
          'Go to: console.cloud.google.com → select project "cv-agent-cfac1" → ' +
          'APIs & Services → Library → search "Google Sheets API" → Enable.',
      };
    }

    if (e?.code === 403 || msg.includes('caller does not have permission') || msg.includes('forbidden')) {
      return {
        ok: false,
        message:
          '❌ Permission denied — open the sheet → Share → add ' +
          (process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? 'firebase-adminsdk-fbsvc@cv-agent-cfac1.iam.gserviceaccount.com') +
          ' as Editor.',
      };
    }

    if (e?.code === 404) {
      return { ok: false, message: '❌ Sheet not found — double-check the URL.' };
    }

    return { ok: false, message: `❌ ${msg || 'Connection failed'}` };
  }
}

// ── Public: append one candidate row ─────────────────────────
export interface CandidateSheetRow {
  name:                  string;
  email:                 string;
  phone:                 string;
  currentRank:           string;
  totalSeaServiceMonths: number;
  rankHistory:           { rank: string; durationMonths?: number }[];
  education:             string;
  emailSubject:          string;
  senderEmail:           string;
  cvFileName:            string;
  reviewStatus:          string;
}

function monthsToLabel(m: number): string {
  if (!m) return '—';
  const y = Math.floor(m / 12), mo = m % 12;
  return [y ? `${y}yr` : '', mo ? `${mo}mo` : ''].filter(Boolean).join(' ');
}

function buildRankSummary(
  history: { rank: string; durationMonths?: number }[],
): string {
  const map = new Map<string, number>();
  for (const e of history) {
    const key = (e.rank || '').trim();
    if (key) map.set(key, (map.get(key) ?? 0) + (e.durationMonths ?? 0));
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([rank, months]) => `${rank}: ${monthsToLabel(months)}`)
    .join(' | ');
}

export async function appendCandidateToSheet(row: CandidateSheetRow): Promise<void> {
  const sheetSettings = await getSheetSettings();
  if (!sheetSettings?.sheetUrl) {
    // Not configured — skip silently
    return;
  }

  const spreadsheetId = extractSheetId(sheetSettings.sheetUrl);
  if (!spreadsheetId) {
    console.error('[Google Sheet] Invalid URL in settings — cannot extract spreadsheet ID:', sheetSettings.sheetUrl);
    return;
  }

  const sheets = await getSheetsClient();
  await ensureHeaders(sheets, spreadsheetId);

  const values = [[
    new Date().toISOString(),                   // Timestamp
    row.name,                                   // Name
    row.email,                                  // Email
    row.phone,                                  // Phone
    row.currentRank,                            // Current Rank
    monthsToLabel(row.totalSeaServiceMonths),   // Total Sea Service
    buildRankSummary(row.rankHistory),          // Rank Experience Summary
    row.education,                              // Education
    row.emailSubject,                           // Email Subject
    row.senderEmail,                            // Sender Email
    row.cvFileName,                             // CV File
    row.reviewStatus,                           // Review Status
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range:            'A:L',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:      { values },
  });

  console.log(`[Google Sheet] Row appended for: ${row.name} (${row.email})`);
}

// ── Update the Review Status of an existing row ──────────────
// Finds the LAST row where column C (Email) matches, then updates column L.
export async function updateCandidateStatusInSheet(
  email: string,
  newStatus: string,
): Promise<void> {
  if (!email) return;

  const sheetSettings = await getSheetSettings();
  if (!sheetSettings?.sheetUrl) return;

  const spreadsheetId = extractSheetId(sheetSettings.sheetUrl);
  if (!spreadsheetId) return;

  const sheets = await getSheetsClient();

  // Read entire Email column (C)
  const res  = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'C:C',
  });
  const rows = res.data.values ?? [];

  // Walk rows bottom-up to find the most recent entry for this email
  let targetRow = -1;
  for (let i = rows.length - 1; i >= 1; i--) {
    const cell = (rows[i]?.[0] ?? '').toString().trim().toLowerCase();
    if (cell === email.trim().toLowerCase()) {
      targetRow = i + 1; // 1-based sheet row
      break;
    }
  }

  if (targetRow === -1) {
    console.warn(`[Google Sheet] No row found for email "${email}" — status update skipped.`);
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range:            `L${targetRow}`,
    valueInputOption: 'RAW',
    requestBody:      { values: [[newStatus]] },
  });

  console.log(`[Google Sheet] Status updated to "${newStatus}" for ${email} (row ${targetRow})`);
}
