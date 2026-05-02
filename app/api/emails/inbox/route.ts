import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorized } from '@/lib/utils/auth-middleware';
import { fetchEmailsPage, fetchEmailById, fetchEmailAttachments } from '@/lib/outlook/client';
import { adminGetProcessedEmails } from '@/lib/firebase/admin-firestore';
import { isSupportedCVFile } from '@/lib/utils/cv-parser';

export const dynamic = 'force-dynamic';

// ── GET /api/emails/inbox ─────────────────────────────────────
// Query params:
//   cursor=<string>  — @odata.nextLink from previous response (omit for first page)
//   limit=<number>   — emails per page (default 50, max 999)
//
// Response:
//   { success, data: OutlookEmail[], nextCursor: string|null, total: number|null, count: number }
export async function GET(req: NextRequest) {
  const uid = await verifyAuthToken(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor') || null;
    const limit  = Math.min(parseInt(searchParams.get('limit') || '50', 10), 999);

    const { emails, nextCursor, total } = await fetchEmailsPage(cursor, limit);

    // Enrich with processed markers from Firestore (optional — skip if unavailable)
    let processedMap = new Map<string, { processedAt: string; attachmentName?: string }>();
    try {
      const processedEmails = await adminGetProcessedEmails();
      processedMap = new Map(processedEmails.map(e => [e.outlookId, e]));
    } catch { /* Firestore not ready yet — markers simply won't show */ }

    const enriched = emails.map(e => ({
      ...e,
      processed:       processedMap.has(e.id),
      processedRecord: processedMap.get(e.id) ?? null,
    }));

    return NextResponse.json({
      success:    true,
      data:       enriched,
      nextCursor,          // null when no more pages
      total,               // total count of emails in mailbox (from @odata.count, first page only)
      count:      enriched.length,
    });
  } catch (err) {
    console.error('GET /api/emails/inbox error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to fetch emails' },
      { status: 500 },
    );
  }
}

// ── POST /api/emails/inbox — single email detail ──────────────
// Body: { id: string }
export async function POST(req: NextRequest) {
  const uid = await verifyAuthToken(req);
  if (!uid) return unauthorized();

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: 'Email ID required' }, { status: 400 });

    const [email, attachments] = await Promise.all([
      fetchEmailById(id),
      fetchEmailAttachments(id),
    ]);

    const enrichedAttachments = attachments.map(a => ({
      ...a,
      isCVFile:     isSupportedCVFile(a.contentType, a.name),
      contentBytes: undefined,
    }));

    return NextResponse.json({ success: true, data: { ...email, attachments: enrichedAttachments } });
  } catch (err) {
    console.error('POST /api/emails/inbox error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to fetch email' },
      { status: 500 },
    );
  }
}
