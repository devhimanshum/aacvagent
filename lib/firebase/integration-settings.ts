/**
 * Integration settings stored in Firestore.
 * API routes call getOutlookSettings() / getOpenAISettings() at runtime.
 * Falls back to env vars if nothing is saved in Firestore.
 */

import { adminDb } from './admin';

export interface OutlookConfig {
  clientId:     string;
  tenantId:     string;
  clientSecret: string;
  inboxEmail:   string;
}

export interface OpenAIConfig {
  apiKey: string;
  model:  string;
}

export interface SheetConfig {
  sheetUrl: string;
}

// ── In-memory cache (5 min TTL) ───────────────────────────────
let cachedOutlook: { data: OutlookConfig | null; at: number } | null = null;
let cachedOpenAI:  { data: OpenAIConfig  | null; at: number } | null = null;
let cachedSheet:   { data: SheetConfig   | null; at: number } | null = null;
const TTL = 5 * 60 * 1000;

function fresh(ts: number) { return Date.now() - ts < TTL; }

export function invalidateCache() {
  cachedOutlook = null;
  cachedOpenAI  = null;
  cachedSheet   = null;
}

// ── Outlook ───────────────────────────────────────────────────
export async function getOutlookSettings(): Promise<OutlookConfig | null> {
  if (cachedOutlook && fresh(cachedOutlook.at)) return cachedOutlook.data;

  try {
    const db   = adminDb();
    const snap = await db.collection('settings').doc('integrations').get();
    const data = snap.data();
    const cfg  = data?.outlook as Partial<OutlookConfig> | undefined;

    const result =
      cfg?.clientId && cfg?.tenantId && cfg?.clientSecret && cfg?.inboxEmail
        ? { clientId: cfg.clientId, tenantId: cfg.tenantId, clientSecret: cfg.clientSecret, inboxEmail: cfg.inboxEmail }
        : null;

    cachedOutlook = { data: result, at: Date.now() };
    return result;
  } catch {
    return null;
  }
}

export async function saveOutlookSettings(cfg: OutlookConfig): Promise<void> {
  const db = adminDb();
  await db.collection('settings').doc('integrations').set({ outlook: cfg }, { merge: true });
  cachedOutlook = { data: cfg, at: Date.now() };
}

// ── OpenAI ────────────────────────────────────────────────────
export async function getOpenAISettings(): Promise<OpenAIConfig | null> {
  if (cachedOpenAI && fresh(cachedOpenAI.at)) return cachedOpenAI.data;

  try {
    const db   = adminDb();
    const snap = await db.collection('settings').doc('integrations').get();
    const data = snap.data();
    const cfg  = data?.openai as Partial<OpenAIConfig> | undefined;

    const result =
      cfg?.apiKey
        ? { apiKey: cfg.apiKey, model: cfg.model || 'gpt-4o-mini' }
        : null;

    cachedOpenAI = { data: result, at: Date.now() };
    return result;
  } catch {
    return null;
  }
}

export async function saveOpenAISettings(cfg: OpenAIConfig): Promise<void> {
  const db = adminDb();
  await db.collection('settings').doc('integrations').set({ openai: cfg }, { merge: true });
  cachedOpenAI = { data: cfg, at: Date.now() };
}

// ── Google Sheet ──────────────────────────────────────────────
export async function getSheetSettings(): Promise<SheetConfig | null> {
  if (cachedSheet && fresh(cachedSheet.at)) return cachedSheet.data;

  try {
    const db   = adminDb();
    const snap = await db.collection('settings').doc('integrations').get();
    const data = snap.data();
    const cfg  = data?.sheet as Partial<SheetConfig> | undefined;

    const result = cfg?.sheetUrl ? { sheetUrl: cfg.sheetUrl } : null;
    cachedSheet = { data: result, at: Date.now() };
    return result;
  } catch {
    return null;
  }
}

export async function saveSheetSettings(cfg: SheetConfig): Promise<void> {
  const db = adminDb();
  await db.collection('settings').doc('integrations').set({ sheet: cfg }, { merge: true });
  cachedSheet = { data: cfg, at: Date.now() };
}

// ── Combined getter ───────────────────────────────────────────
export async function getAllIntegrationSettings() {
  const [outlook, openai, sheet] = await Promise.all([
    getOutlookSettings(),
    getOpenAISettings(),
    getSheetSettings(),
  ]);
  return { outlook, openai, sheet };
}
