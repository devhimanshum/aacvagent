import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './admin';
import type { Candidate, RankConfig, ReviewStatus, OutlookSettings, GeminiSettings, ProcessedEmail, TokenUsageRecord, DailyUsageSummary, LegacyCv } from '@/types';

const C = {
  PENDING:           'candidates/pending/list',
  SELECTED:          'candidates/selected/list',
  UNSELECTED:        'candidates/unselected/list',
  PROCESSED_EMAILS:  'emails/processedEmails/list',
  KNOWN_DUPLICATES:  'emails/knownDuplicates/list',
  CONFIG:            'config',
  SETTINGS:          'settings',
  LEGACY_CVS:        'legacyCvs',
} as const;

// ── Helper: Firestore doc → plain object ──────────────────────
function toPlain(snap: FirebaseFirestore.DocumentSnapshot): Record<string, unknown> {
  const data = snap.data() || {};
  const out: Record<string, unknown> = { id: snap.id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'toDate' in v) {
      out[k] = (v as FirebaseFirestore.Timestamp).toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Rank Config ───────────────────────────────────────────────
export async function adminGetRankConfig(): Promise<RankConfig | null> {
  const db   = adminDb();
  const snap = await db.collection(C.CONFIG).doc('rankConfig').get();
  if (!snap.exists) return null;
  return toPlain(snap) as unknown as RankConfig;
}

export async function adminSaveRankConfig(config: Omit<RankConfig, 'id'>): Promise<void> {
  const db = adminDb();
  await db.collection(C.CONFIG).doc('rankConfig').set(config, { merge: true });
}

// ── Candidates — save to PENDING ─────────────────────────────
export async function adminSaveCandidate(candidate: Omit<Candidate, 'id'>): Promise<string> {
  const db  = adminDb();
  const ref = await db.collection(C.PENDING).add({
    ...candidate,
    reviewStatus: 'pending',
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

// ── Candidates — review action (pending → selected/unselected) ─
export async function adminReviewCandidate(
  candidateId: string,
  decision: 'selected' | 'unselected',
  reviewNote?: string,
): Promise<void> {
  const db       = adminDb();
  const pendRef  = db.collection(C.PENDING).doc(candidateId);
  const snap     = await pendRef.get();
  if (!snap.exists) throw new Error(`Candidate ${candidateId} not found in pending`);

  const data = snap.data()!;
  const destCollection = decision === 'selected' ? C.SELECTED : C.UNSELECTED;

  await db.collection(destCollection).doc(candidateId).set({
    ...data,
    reviewStatus: decision,
    reviewedAt: new Date().toISOString(),
    ...(reviewNote ? { reviewNote } : {}),
  });
  await pendRef.delete();
}

// ── Candidates — undo review (selected/unselected → pending) ──
export async function adminUndoReview(candidateId: string): Promise<void> {
  const db = adminDb();
  let snap: FirebaseFirestore.DocumentSnapshot | null = null;
  let srcCollection: string | null = null;

  // Try selected first, then unselected
  const selSnap = await db.collection(C.SELECTED).doc(candidateId).get();
  if (selSnap.exists) { snap = selSnap; srcCollection = C.SELECTED; }
  else {
    const unselSnap = await db.collection(C.UNSELECTED).doc(candidateId).get();
    if (unselSnap.exists) { snap = unselSnap; srcCollection = C.UNSELECTED; }
  }

  if (!snap || !srcCollection) throw new Error(`Candidate ${candidateId} not found in selected or unselected`);

  const data = snap.data()!;
  await db.collection(C.PENDING).doc(candidateId).set({
    ...data,
    reviewStatus: 'pending',
    reviewedAt:   FieldValue.delete(),
    reviewNote:   FieldValue.delete(),
  });
  await db.collection(srcCollection).doc(candidateId).delete();
}

// ── Candidates — get a single candidate by ID ─────────────────
// Searches pending → selected → unselected in order.
export async function adminGetCandidateById(id: string): Promise<Candidate | null> {
  const db = adminDb();
  for (const col of [C.PENDING, C.SELECTED, C.UNSELECTED]) {
    const snap = await db.collection(col).doc(id).get();
    if (snap.exists) return toPlain(snap) as unknown as Candidate;
  }
  return null;
}

// ── Candidates — fetch lists ──────────────────────────────────
export async function adminGetPendingCandidates(): Promise<Candidate[]> {
  const db   = adminDb();
  const snap = await db.collection(C.PENDING).orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => toPlain(d) as unknown as Candidate);
}

export async function adminGetAllCandidatesPaged(
  status: 'selected' | 'unselected',
  limit = 20,
  afterId?: string,
): Promise<{ candidates: Candidate[]; hasMore: boolean; nextId: string | null }> {
  const db  = adminDb();
  const col = status === 'selected' ? C.SELECTED : C.UNSELECTED;
  let   q   = db.collection(col).orderBy('createdAt', 'desc').limit(limit + 1);

  if (afterId) {
    const cursor = await db.collection(col).doc(afterId).get();
    if (cursor.exists) q = q.startAfter(cursor);
  }

  const snap       = await q.get();
  const docs       = snap.docs.map(d => toPlain(d) as unknown as Candidate);
  const hasMore    = docs.length > limit;
  const candidates = hasMore ? docs.slice(0, limit) : docs;
  const nextId     = hasMore ? candidates[candidates.length - 1].id : null;
  return { candidates, hasMore, nextId };
}

export async function adminGetAllCandidates(): Promise<Candidate[]> {
  const db = adminDb();
  const [selSnap, unselSnap] = await Promise.all([
    db.collection(C.SELECTED).orderBy('createdAt', 'desc').get(),
    db.collection(C.UNSELECTED).orderBy('createdAt', 'desc').get(),
  ]);
  const selected   = selSnap.docs.map(d => toPlain(d) as unknown as Candidate);
  const unselected = unselSnap.docs.map(d => toPlain(d) as unknown as Candidate);
  return [...selected, ...unselected].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function adminCheckDuplicate(email: string): Promise<boolean> {
  if (!email) return false;
  const db    = adminDb();
  const paths = [C.PENDING, C.SELECTED, C.UNSELECTED];
  for (const path of paths) {
    const snap = await db.collection(path).where('email', '==', email).limit(1).get();
    if (!snap.empty) return true;
  }
  return false;
}

// ── Known Duplicates ──────────────────────────────────────────
// Stores Outlook attachment IDs that were already found to be duplicates.
// Outlook attachment IDs are stable (tied to the specific message), so this
// lets us skip AI processing entirely on repeat encounters — no API cost.

export async function adminIsKnownDuplicate(attachmentId: string): Promise<boolean> {
  if (!attachmentId) return false;
  const db   = adminDb();
  const snap = await db
    .collection(C.KNOWN_DUPLICATES)
    .where('attachmentId', '==', attachmentId)
    .limit(1)
    .get();
  return !snap.empty;
}

export async function adminSaveKnownDuplicate(data: {
  attachmentId:  string;
  candidateEmail: string;
  candidateName:  string;
  outlookEmailId: string;
  fileName:       string;
}): Promise<void> {
  const db = adminDb();
  // Use attachmentId as the document ID — idempotent, no duplicate docs
  await db.collection(C.KNOWN_DUPLICATES).doc(data.attachmentId.replace(/[^a-zA-Z0-9_-]/g, '_')).set({
    ...data,
    detectedAt: new Date().toISOString(),
    createdAt:  FieldValue.serverTimestamp(),
  });
}

// ── Processed Emails ──────────────────────────────────────────
export async function adminIsEmailProcessed(outlookId: string): Promise<boolean> {
  const db   = adminDb();
  const snap = await db
    .collection(C.PROCESSED_EMAILS)
    .where('outlookId', '==', outlookId)
    .limit(1)
    .get();
  return !snap.empty;
}

export async function adminSaveProcessedEmail(email: Omit<ProcessedEmail, 'id'>): Promise<string> {
  const db  = adminDb();
  const ref = await db.collection(C.PROCESSED_EMAILS).add({
    ...email,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function adminGetProcessedEmails(): Promise<ProcessedEmail[]> {
  const db   = adminDb();
  const snap = await db
    .collection(C.PROCESSED_EMAILS)
    .orderBy('processedAt', 'desc')
    .limit(100)
    .get();
  return snap.docs.map(d => toPlain(d) as unknown as ProcessedEmail);
}

// ── Token Usage ───────────────────────────────────────────────
export async function adminSaveTokenUsage(record: Omit<TokenUsageRecord, 'id'>): Promise<void> {
  const db = adminDb();
  await db.collection('tokenUsage').add({ ...record, createdAt: FieldValue.serverTimestamp() });
}

export async function adminGetTokenUsage(days = 30): Promise<TokenUsageRecord[]> {
  const db    = adminDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  // Simple single-field orderBy — no composite index needed
  // Filter by date in memory to avoid index requirement
  const snap = await db.collection('tokenUsage')
    .orderBy('processedAt', 'desc')
    .limit(500)
    .get();

  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as TokenUsageRecord))
    .filter(r => r.date >= sinceStr);
}

export async function adminGetDailyUsageSummary(days = 30): Promise<DailyUsageSummary[]> {
  const records = await adminGetTokenUsage(days);
  const map = new Map<string, DailyUsageSummary>();

  for (const r of records) {
    const existing = map.get(r.date) ?? {
      date: r.date, inputTokens: 0, outputTokens: 0,
      totalTokens: 0, requests: 0, costUsd: 0,
    };
    map.set(r.date, {
      ...existing,
      inputTokens:  existing.inputTokens  + r.inputTokens,
      outputTokens: existing.outputTokens + r.outputTokens,
      totalTokens:  existing.totalTokens  + r.totalTokens,
      requests:     existing.requests     + 1,
      costUsd:      existing.costUsd      + r.costUsd,
    });
  }

  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

// ── Legacy CV import ──────────────────────────────────────────

/** Split array into chunks of at most `size` elements */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Derive a stable, deterministic Firestore document ID from a record.
 * Using a fixed ID means:
 *   - Duplicate check queries are eliminated entirely (0 reads per batch).
 *   - Importing the same file twice is idempotent — same ID → same doc overwritten.
 *   - 9,500 records = 19 batch.set() commits, nothing else.
 */
function stableDocId(rec: Omit<LegacyCv, 'id'>): string {
  // Prefer email as the unique key; fall back to name.
  const raw = (rec.email || `name__${rec.name}` || '').toLowerCase().trim();
  const safe = raw
    .replace(/[^a-z0-9]/g, '_')   // remove chars Firestore dislikes
    .replace(/_+/g, '_')           // collapse runs of underscores
    .replace(/^_|_$/g, '')         // trim leading/trailing underscores
    .slice(0, 500);                // Firestore ID limit is 1500 bytes
  // Guarantee non-empty
  return safe || `anon_${Math.random().toString(36).slice(2, 10)}`;
}

export async function adminImportLegacyCvs(
  records: Omit<LegacyCv, 'id'>[],
): Promise<{ imported: number; skipped: number }> {
  const db  = adminDb();
  const col = db.collection(C.LEGACY_CVS);
  const now = new Date().toISOString();

  // De-duplicate within this batch first (same email/name appearing twice in the file)
  const seen      = new Set<string>();
  const deduped   = records.filter(r => {
    const id = stableDocId(r);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const withinFileDups = records.length - deduped.length;

  // ── One batch.set() per Firestore-max chunk — ZERO lookup queries ──
  // batch.set() with a deterministic ID is idempotent:
  // if the doc already exists it is overwritten with identical data (no harm).
  const CHUNK = 499;  // Firestore batch limit
  let   written = 0;

  for (const chunk of chunkArray(deduped, CHUNK)) {
    const batch = db.batch();
    for (const rec of chunk) {
      batch.set(col.doc(stableDocId(rec)), {
        ...rec,
        nameLower:        rec.name.toLowerCase().trim(),
        rankLower:        (rec.rank ?? '').toLowerCase().trim(),
        nationalityLower: (rec.nationality ?? '').toLowerCase().trim(),
        createdAt: now,
      });
    }
    await batch.commit();
    written += chunk.length;
  }

  return { imported: written, skipped: withinFileDups };
}

export async function adminGetLegacyCvsPaged(
  limit: number,
  afterId?: string,
  search?: string,
  sort: 'newest' | 'name_az' | 'name_za' = 'newest',
  rankFilter?: string,
  natFilter?: string,
): Promise<{ records: LegacyCv[]; hasMore: boolean; nextId: string | null; total: number }> {
  const db  = adminDb();
  const col = db.collection(C.LEGACY_CVS);

  const q_term = search?.trim().toLowerCase() || '';
  const q_rank = rankFilter?.trim().toLowerCase() || '';
  const q_nat  = natFilter?.trim().toLowerCase() || '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let baseQ: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = col as any;

  // Exact-match equality filters (server-side across all records)
  if (q_rank) baseQ = baseQ.where('rankLower', '==', q_rank);
  if (q_nat)  baseQ = baseQ.where('nationalityLower', '==', q_nat);

  // Name prefix search (range query)
  if (q_term) {
    baseQ = baseQ
      .where('nameLower', '>=', q_term)
      .where('nameLower', '<=', q_term + '');
  }

  const countSnap = await baseQ.count().get();
  const total     = countSnap.data().count;

  // ── orderBy rules (no composite indexes required) ─────────────────────────
  // Firestore needs a composite index when orderBy field ≠ equality-filter field.
  // Rule: always orderBy the LEADING equality filter field when one is active.
  // Name range (>=/<= on nameLower) always forces orderBy('nameLower').
  // When no filter is active, honour the user's sort preference.
  let q: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;
  if (q_term) {
    // Name range query — must orderBy nameLower (Firestore requirement)
    q = baseQ.orderBy('nameLower', sort === 'name_za' ? 'desc' : 'asc').limit(limit + 1);
  } else if (q_rank) {
    // Rank equality filter — orderBy rankLower (same field → single-field index, no composite)
    q = baseQ.orderBy('rankLower', 'asc').limit(limit + 1);
  } else if (q_nat) {
    // Nationality equality filter — orderBy nationalityLower (same field → single-field index)
    q = baseQ.orderBy('nationalityLower', 'asc').limit(limit + 1);
  } else if (sort === 'name_az') {
    q = baseQ.orderBy('nameLower', 'asc').limit(limit + 1);
  } else if (sort === 'name_za') {
    q = baseQ.orderBy('nameLower', 'desc').limit(limit + 1);
  } else {
    q = baseQ.orderBy('createdAt', 'desc').limit(limit + 1);
  }

  if (afterId) {
    const cursor = await col.doc(afterId).get();
    if (cursor.exists) q = q.startAfter(cursor);
  }

  const snap    = await q.get();
  const docs    = snap.docs.map(d => toPlain(d) as unknown as LegacyCv);
  const hasMore = docs.length > limit;
  const records = hasMore ? docs.slice(0, limit) : docs;
  const nextId  = hasMore ? records[records.length - 1].id : null;

  return { records, hasMore, nextId, total };
}

// ── Legacy job config (kept so old imports don't break) ───────
export async function adminGetJobConfig() {
  return null;
}

// ── Settings ──────────────────────────────────────────────────
export async function adminGetOutlookSettings(): Promise<OutlookSettings | null> {
  const db   = adminDb();
  const snap = await db.collection(C.SETTINGS).doc('outlookConfig').get();
  if (!snap.exists) return null;
  return snap.data() as OutlookSettings;
}

export async function adminGetGeminiSettings(): Promise<GeminiSettings | null> {
  const db   = adminDb();
  const snap = await db.collection(C.SETTINGS).doc('geminiConfig').get();
  if (!snap.exists) return null;
  return snap.data() as GeminiSettings;
}

// ── Stats ─────────────────────────────────────────────────────
export async function adminGetStats() {
  const db = adminDb();
  const [pendSnap, selSnap, unselSnap, emailsSnap] = await Promise.all([
    db.collection(C.PENDING).count().get(),
    db.collection(C.SELECTED).count().get(),
    db.collection(C.UNSELECTED).count().get(),
    db.collection(C.PROCESSED_EMAILS).count().get(),
  ]);
  // Count skipped-as-duplicate in processedEmails (new approach — duplicates are never saved)
  const dupSkippedSnap = await db
    .collection(C.PROCESSED_EMAILS)
    .where('status', '==', 'skipped')
    .count()
    .get();

  const pending    = pendSnap.data().count;
  const selected   = selSnap.data().count;
  const unselected = unselSnap.data().count;

  return {
    pending,
    selected,
    unselected,
    total:           selected + unselected,
    processedEmails: emailsSnap.data().count,
    duplicates:      dupSkippedSnap.data().count,
  };
}
