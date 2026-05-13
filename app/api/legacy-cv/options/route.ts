import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorized } from '@/lib/utils/auth-middleware';
import { adminDb } from '@/lib/firebase/admin';

/**
 * GET /api/legacy-cv/options
 *
 * Returns the distinct nationality and rank values stored in the
 * `config/legacyCvs_meta` Firestore document (populated by the reindex route).
 */
export async function GET(req: NextRequest) {
  const uid = await verifyAuthToken(req);
  if (!uid) return unauthorized();

  try {
    const db   = adminDb();
    const snap = await db.collection('config').doc('legacyCvs_meta').get();

    if (!snap.exists) {
      return NextResponse.json({ success: true, nationalities: [], ranks: [] });
    }

    const data         = snap.data() ?? {};
    const nationalities = (data.nationalities as string[] | undefined) ?? [];
    const ranks         = (data.ranks        as string[] | undefined) ?? [];

    return NextResponse.json({ success: true, nationalities, ranks });
  } catch (err) {
    console.error('[legacy-cv/options GET]', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch options' },
      { status: 500 },
    );
  }
}
