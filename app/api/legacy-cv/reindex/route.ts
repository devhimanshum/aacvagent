import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorized } from '@/lib/utils/auth-middleware';
import { adminDb } from '@/lib/firebase/admin';

/**
 * POST /api/legacy-cv/reindex
 *
 * Backfills rankLower and nationalityLower on all legacy CV documents
 * that are missing these fields. Runs in 500-doc batches.
 * Safe to call multiple times — skips docs that already have both fields.
 *
 * Also collects distinct nationality and rank values and saves them to
 * config/legacyCvs_meta so the filter options API can serve them instantly.
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

    const allNationalities = new Set<string>();
    const allRanks         = new Set<string>();

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

        // Collect distinct values from every document (not just updated ones)
        const nat  = (data.nationality ?? '').toString().trim();
        const rank = (data.rank        ?? '').toString().trim();
        if (nat)  allNationalities.add(nat);
        if (rank) allRanks.add(rank);

        const needsUpdate = !data.rankLower || !data.nationalityLower;

        if (needsUpdate) {
          batch.update(doc.ref, {
            rankLower:        rank.toLowerCase(),
            nationalityLower: nat.toLowerCase(),
            nameLower:        (data.name ?? '').toString().toLowerCase().trim(),
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

    // Persist distinct values to config doc for the options API
    const sortedNats  = Array.from(allNationalities).sort();
    const sortedRanks = Array.from(allRanks).sort();

    await db.collection('config').doc('legacyCvs_meta').set(
      { nationalities: sortedNats, ranks: sortedRanks, updatedAt: new Date().toISOString() },
      { merge: true },
    );

    return NextResponse.json({ success: true, processed, updated });
  } catch (err) {
    console.error('[legacy-cv reindex]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Reindex failed' },
      { status: 500 },
    );
  }
}
