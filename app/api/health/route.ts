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
  try {
    const { getOpenAISettings } = await import('@/lib/firebase/integration-settings');
    const openaiStored = await getOpenAISettings();
    const openaiEnvKey = process.env.OPENAI_API_KEY || '';
    const hasKey = !!(openaiStored?.apiKey || (openaiEnvKey && openaiEnvKey !== 'undefined'));
    const model  = openaiStored?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    checks.openai = hasKey
      ? { ok: true,  message: `Key set ✅ (model: ${model})` }
      : { ok: false, message: 'No OpenAI API key — go to Settings → Connections and enter your key' };
  } catch {
    const openaiEnvKey = process.env.OPENAI_API_KEY || '';
    const hasKey = !!(openaiEnvKey && openaiEnvKey !== 'undefined');
    checks.openai = hasKey
      ? { ok: true,  message: `Key set via env ✅ (model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'})` }
      : { ok: false, message: 'OPENAI_API_KEY not configured' };
  }

  // ── Outlook ───────────────────────────────────────────────
  const outlookConfigured = await isOutlookConfigured();
  if (!outlookConfigured) {
    checks.outlook = {
      ok: false,
      message: 'Not configured — go to Settings → Connections and enter Outlook credentials',
    };
  } else {
    try {
      const result = await validateOutlookConnection();
      checks.outlook = {
        ok: result.ok,
        message: result.ok ? 'Connected ✅' : `Connection failed: ${result.error}`,
      };
    } catch (err) {
      checks.outlook = {
        ok: false,
        message: err instanceof Error ? err.message : 'Connection error',
      };
    }
  }

  const allOk = Object.values(checks).every(c => c.ok);

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    checks,
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  }, { status: allOk ? 200 : 503 });
}
