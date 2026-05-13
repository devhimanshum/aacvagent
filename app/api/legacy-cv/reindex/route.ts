import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorized } from '@/lib/utils/auth-middleware';
import { adminDb } from '@/lib/firebase/admin';

/**
 * POST /api/legacy-cv/reindex
 *
 * Backfills rankLower and nationalityLower on all legacy CV documents
 * that are missing these fields. Runs in 500-doc batches.
 * Safe to call multiple times — skips docs that already have both fields.
 */
export async function POST(req: NextRequest) {
  const uid = await verifyAuthToken(req);
  if (!uid) return unauthorized();

  try {
    const db  = adminDb();
    const col = db.collection('legacyCvs');

    let processed = 0;
    let updated   = 0;
    let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = col.limit(500);
      if (lastDoc) q = q.startAfter(lastDoc);

      const snap = await q.get();
      if (snap.empty) break;

      const batch = db.batch();
      let batchHasWrites = false;

      for (const doc of snap.docs) {
        const data = doc.data();
        const needsUpdate = !data.rankLower || !data.nationalityLower;

        if (needsUpdate) {
          batch.update(doc.ref, {
            rankLower:        (data.rank        ?? '').toLowerCase().trim(),
            nationalityLower: (data.nationality ?? '').toLowerCase().trim(),
            nameLower:        (data.name        ?? '').toLowerCase().trim(),
          });
          updated++;
          batchHasWrites = true;
        }

        processed++;
      }

      if (batchHasWrites) await batch.commit();
      lastDoc = snap.docs[snap.docs.length - 1];

      if (snap.docs.length < 500) break;
    }

    return NextResponse.json({ success: true, processed, updated });
  } catch (err) {
    console.error('[legacy-cv reindex]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Reindex failed' },
      { status: 500 },
    );
  }
}
