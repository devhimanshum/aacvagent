import { NextResponse } from 'next/server';
import { getAdminInitError } from '@/lib/firebase/admin';
import { isOutlookConfigured, validateOutlookConnection } from '@/lib/outlook/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { ok: boolean; message: string }> = {};

  // ── Firebase client config ────────────────────────────────
  checks.firebaseClient = {
    ok: true,
    message: 'Hardcoded — always available',
  };

  // ── Firebase Admin SDK ────────────────────────────────────
  const adminEnvOk =
    !!process.env.FIREBASE_ADMIN_PROJECT_ID &&
    !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    !!process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!adminEnvOk) {
    checks.firebaseAdmin = {
      ok: false,
      message: 'Missing env vars — add FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY in Vercel dashboard',
    };
  } else {
    try {
      const { adminAuth } = await import('@/lib/firebase/admin');
      adminAuth(); // triggers init
      checks.firebaseAdmin = { ok: true, message: 'Initialised ✅' };
    } catch (err) {
      checks.firebaseAdmin = {
        ok: false,
        message: err instanceof Error ? err.message : 'Init failed',
      };
    }
  }

  // ── OpenAI ────────────────────────────────────────────────
  const openaiKey = process.env.OPENAI_API_KEY || '';
  if (!openaiKey || openaiKey === 'undefined') {
    checks.openai = { ok: false, message: 'OPENAI_API_KEY not set in Vercel dashboard' };
  } else {
    checks.openai = { ok: true, message: `Key set ✅ (model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'})` };
  }

  // ── Outlook ───────────────────────────────────────────────
  if (!isOutlookConfigured()) {
    const missing = [
      !process.env.OUTLOOK_CLIENT_ID     && 'OUTLOOK_CLIENT_ID',
      !process.env.OUTLOOK_TENANT_ID     && 'OUTLOOK_TENANT_ID',
      !process.env.OUTLOOK_CLIENT_SECRET && 'OUTLOOK_CLIENT_SECRET',
      !process.env.OUTLOOK_INBOX_EMAIL   && 'OUTLOOK_INBOX_EMAIL',
    ].filter(Boolean).join(', ');
    checks.outlook = { ok: false, message: `Missing: ${missing} — add in Vercel dashboard` };
  } else {
    const result = await validateOutlookConnection();
    checks.outlook = {
      ok: result.ok,
      message: result.ok ? `Connected ✅ (${process.env.OUTLOOK_INBOX_EMAIL})` : result.error || 'Connection failed',
    };
  }

  const allOk = Object.values(checks).every(c => c.ok);

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    checks,
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  }, { status: allOk ? 200 : 503 });
}
