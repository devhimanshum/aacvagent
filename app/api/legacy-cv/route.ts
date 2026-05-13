import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorized } from '@/lib/utils/auth-middleware';
import { adminImportLegacyCvs, adminGetLegacyCvsPaged } from '@/lib/firebase/admin-firestore';
import type { LegacyCv } from '@/types';

// ── Data cleaning helpers ─────────────────────────────────────

function cleanEmail(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return '';
  // Take text before _x000D_, \r\n, or \t; then trim and lowercase
  let email = raw.split(/_x000D_|\r\n|\t/)[0].trim().toLowerCase();
  // If multiple emails are on separate lines just take the first
  email = email.split('\n')[0].trim();
  return email;
}

function cleanPhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes('[GPT ERROR]')) return null;
  return trimmed;
}

function cleanName(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim();
}

function cleanString(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim();
}

function buildRecord(raw: Record<string, unknown>): Omit<LegacyCv, 'id'> {
  const phones: string[] = [];
  for (const key of ['M1', 'M2', 'M3']) {
    const p = cleanPhone(raw[key]);
    if (p) phones.push(p);
  }

  const nationality = cleanString(raw['Nationality'] ?? raw['nationality']);
  const rank        = cleanString(raw['Rank'] ?? raw['rank']);

  return {
    name:             cleanName(raw['Name'] ?? raw['name']),
    nationality,
    rank,
    email:            cleanEmail(raw['Email'] ?? raw['email']),
    phones,
    rankLower:        rank.toLowerCase().trim(),
    nationalityLower: nationality.toLowerCase().trim(),
    importedAt:       new Date().toISOString(),
    createdAt:        new Date().toISOString(),
  };
}

// ── POST /api/legacy-cv ───────────────────────────────────────
export async function POST(req: NextRequest) {
  const uid = await verifyAuthToken(req);
  if (!uid) return unauthorized();

  try {
    const body = await req.json() as { records: unknown[] };

    if (!Array.isArray(body.records)) {
      return NextResponse.json({ success: false, error: 'records must be an array' }, { status: 400 });
    }

    const cleaned = body.records
      .filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object')
      .map(buildRecord);

    const { imported, skipped } = await adminImportLegacyCvs(cleaned);

    return NextResponse.json({ success: true, imported, skipped });
  } catch (err) {
    console.error('[legacy-cv POST]', err);
    return NextResponse.json({ success: false, error: 'Import failed' }, { status: 500 });
  }
}

// ── GET /api/legacy-cv ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const uid = await verifyAuthToken(req);
  if (!uid) return unauthorized();

  try {
    const { searchParams } = new URL(req.url);
    const limit   = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200);
    const afterId = searchParams.get('afterId') ?? undefined;
    const search  = searchParams.get('search') ?? undefined;
    const sortRaw = searchParams.get('sort') ?? 'newest';
    const sort    = (['newest', 'name_az', 'name_za'] as const).includes(sortRaw as 'newest')
      ? sortRaw as 'newest' | 'name_az' | 'name_za'
      : 'newest';
    const rank    = searchParams.get('rank') ?? undefined;
    const nat     = searchParams.get('nat')  ?? undefined;

    const data = await adminGetLegacyCvsPaged(limit, afterId, search, sort, rank, nat);

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('[legacy-cv GET]', err);
    return NextResponse.json({ success: false, error: 'Fetch failed' }, { status: 500 });
  }
}
