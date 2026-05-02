import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';

export async function verifyAuthToken(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch (err) {
    // Log the real error so it appears in Vercel function logs
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Firebase Admin') || msg.includes('env vars missing') || msg.includes('PRIVATE_KEY')) {
      console.error('[Auth] Firebase Admin SDK not initialised correctly:', msg);
      console.error('[Auth] Check that FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY are set in Vercel → Settings → Environment Variables');
    }
    return null;
  }
}

export function unauthorized() {
  return NextResponse.json(
    { success: false, error: 'Unauthorized — check Firebase Admin SDK configuration in Vercel dashboard' },
    { status: 401 },
  );
}
