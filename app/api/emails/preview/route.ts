import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorized } from '@/lib/utils/auth-middleware';
import { fetchAllEmails } from '@/lib/outlook/client';
import { adminIsEmailProcessed } from '@/lib/firebase/admin-firestore';

export interface PreviewEmail {
  id: string;
  internetMessageId?: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  receivedAt: string;
  hasAttachments: boolean;
  isProcessed: boolean;
}

export async function GET(req: NextRequest) {
  const uid = await verifyAuthToken(req);
  if (!uid) return unauthorized();

  try {
    // Fetch recent emails (up to 100)
    const allEmails = await fetchAllEmails(100);

    // Only emails that have attachments (potential CVs)
    const withAttachments = allEmails.filter(e => e.hasAttachments);

    // Check processed status in parallel (batched to avoid too many concurrent reads)
    const BATCH = 10;
    const results: PreviewEmail[] = [];

    for (let i = 0; i < withAttachments.length; i += BATCH) {
      const batch = withAttachments.slice(i, i + BATCH);
      const processed = await Promise.all(
        batch.map(e => adminIsEmailProcessed(e.id, e.internetMessageId)),
      );
      batch.forEach((e, idx) => {
        results.push({
          id:               e.id,
          internetMessageId: e.internetMessageId,
          subject:          e.subject || '(No Subject)',
          senderName:       e.from?.emailAddress?.name  || '',
          senderEmail:      e.from?.emailAddress?.address || '',
          receivedAt:       e.receivedDateTime,
          hasAttachments:   true,
          isProcessed:      processed[idx],
        });
      });
    }

    const pending   = results.filter(r => !r.isProcessed);
    const processed = results.filter(r =>  r.isProcessed);

    return NextResponse.json({
      success: true,
      data: {
        emails:         results,
        pendingCount:   pending.length,
        processedCount: processed.length,
        totalCount:     results.length,
      },
    });
  } catch (err) {
    console.error('GET /api/emails/preview error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to scan inbox' },
      { status: 500 },
    );
  }
}
