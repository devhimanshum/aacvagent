import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './admin';
import type { Candidate, RankConfig, ReviewStatus, OutlookSettings, GeminiSettings, ProcessedEmail, TokenUsageRecord, DailyUsageSummary, LegacyCv } from '@/types';

const C = {
  PENDING:          'candidates/pending/list',
  SELECTED:         'candidates/selected/list',
  UNSELECTED:       'candidates/unselected/list',
  PROCESSED_EMAILS: 'emails/processedEmails/list',
  CONFIG:           'config',
  SETTINGS:         'settings',
  LEGACY_CVS:       'legacyCvs',
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

export async function adminImportLegacyCvs(
  records: Omit<LegacyCv, 'id'>[],
): Promise<{ imported: number; skipped: number }> {
  const db  = adminDb();
  const col = db.collection(C.LEGACY_CVS);

  // ── 1. Collect unique incoming keys ──────────────────────────
  const incomingEmails    = Array.from(new Set(records.map(r => r.email).filter(Boolean)));
  const incomingNameKeys  = Array.from(new Set(records.map(r => r.name.toLowerCase().trim()).filter(Boolean)));

  const existingEmails    = new Set<string>();
  const existingNameKeys  = new Set<string>();

  // Check existing emails in batches of 30 (Firestore 'in' limit)
  for (const chunk of chunkArray(incomingEmails, 30)) {
    const snap = await col.where('email', 'in', chunk).select('email').get();
    snap.docs.forEach(d => { const e = d.get('email') as string; if (e) existingEmails.add(e); });
  }

  // Check existing name keys in batches of 30
  for (const chunk of chunkArray(incomingNameKeys, 30)) {
    const snap = await col.where('nameLower', 'in', chunk).select('nameLower').get();
    snap.docs.forEach(d => { const n = d.get('nameLower') as string; if (n) existingNameKeys.add(n); });
  }

  // ── 2. Filter duplicates ──────────────────────────────────────
  const toInsert = records.filter(r => {
    if (r.email && existingEmails.has(r.email))                          return false;
    if (r.name  && existingNameKeys.has(r.name.toLowerCase().trim()))    return false;
    return true;
  });

  // ── 3. Batch-write new records ────────────────────────────────
  const CHUNK = 499;
  let   imported = 0;
  const now      = new Date().toISOString();

  for (const chunk of chunkArray(toInsert, CHUNK)) {
    const batch = db.batch();
    for (const rec of chunk) {
      const ref = col.doc();
      batch.set(ref, {
        ...rec,
        nameLower: rec.name.toLowerCase().trim(),
        createdAt: now,
      });
    }
    await batch.commit();
    imported += chunk.length;
  }

  return { imported, skipped: records.length - imported };
}

export async function adminGetLegacyCvsPaged(
  limit: number,
  afterId?: string,
  search?: string,
): Promise<{ records: LegacyCv[]; hasMore: boolean; nextId: string | null; total: number }> {
  const db  = adminDb();
  const col = db.collection(C.LEGACY_CVS);

  // Build base query — range on nameLower enables prefix search across all records
  const q_term = search?.trim().toLowerCase() || '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let baseQ: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = col as any;
  if (q_term) {
    baseQ = col
      .where('nameLower', '>=', q_term)
      .where('nameLower', '<=', q_term + '');
  }

  // Total count (respects search filter)
  const countSnap = await baseQ.count().get();
  const total     = countSnap.data().count;

  // When searching, sort by name; otherwise newest first
  let q = q_term
    ? baseQ.orderBy('nameLower', 'asc').limit(limit + 1)
    : baseQ.orderBy('createdAt', 'desc').limit(limit + 1);

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
