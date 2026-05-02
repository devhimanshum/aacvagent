import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorized } from '@/lib/utils/auth-middleware';
import { validateOutlookConnection, isOutlookConfigured } from '@/lib/outlook/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const uid = await verifyAuthToken(req);
  if (!uid) return unauthorized();

  const outlookConfigured = isOutlookConfigured();
  const openaiConfigured  = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'undefined');

  return NextResponse.json({
    success: true,
    data: {
      outlook: {
        configured: outlookConfigured,
        inboxEmail: process.env.OUTLOOK_INBOX_EMAIL || '',
        clientId:   process.env.OUTLOOK_CLIENT_ID
          ? '••••' + process.env.OUTLOOK_CLIENT_ID.slice(-4)
          : '',
        missingVars: [
          !process.env.OUTLOOK_CLIENT_ID     && 'OUTLOOK_CLIENT_ID',
          !process.env.OUTLOOK_TENANT_ID     && 'OUTLOOK_TENANT_ID',
          !process.env.OUTLOOK_CLIENT_SECRET && 'OUTLOOK_CLIENT_SECRET',
          !process.env.OUTLOOK_INBOX_EMAIL   && 'OUTLOOK_INBOX_EMAIL',
        ].filter(Boolean),
      },
      openai: {
        configured: openaiConfigured,
        model:      process.env.OPENAI_MODEL || 'gpt-4o-mini',
        missingVars: !openaiConfigured ? ['OPENAI_API_KEY'] : [],
      },
      firebaseAdmin: {
        configured: !!(
          process.env.FIREBASE_ADMIN_PROJECT_ID &&
          process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
          process.env.FIREBASE_ADMIN_PRIVATE_KEY
        ),
      },
    },
  });
}

export async function POST(req: NextRequest) {
  const uid = await verifyAuthToken(req);
  if (!uid) return unauthorized();

  try {
    const body = await req.json();

    if (body.type === 'test_outlook') {
      if (!isOutlookConfigured()) {
        return NextResponse.json({
          success: false,
          message: 'Outlook env vars not set — add OUTLOOK_CLIENT_ID, OUTLOOK_TENANT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_INBOX_EMAIL in Vercel → Settings → Environment Variables, then redeploy.',
        });
      }
      const result = await validateOutlookConnection();
      return NextResponse.json({
        success: result.ok,
        message: result.ok
          ? '✅ Outlook connected successfully'
          : `❌ Connection failed: ${result.error}`,
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}
