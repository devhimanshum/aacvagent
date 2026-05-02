import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';

let adminApp: App | null = null;
let initError: string | null = null;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const projectId   = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey      = process.env.FIREBASE_ADMIN_PRIVATE_KEY || '';

  if (!projectId || !clientEmail || !rawKey) {
    initError = `Firebase Admin env vars missing: ${[
      !projectId   && 'FIREBASE_ADMIN_PROJECT_ID',
      !clientEmail && 'FIREBASE_ADMIN_CLIENT_EMAIL',
      !rawKey      && 'FIREBASE_ADMIN_PRIVATE_KEY',
    ].filter(Boolean).join(', ')}`;
    throw new Error(initError);
  }

  // Handle BOTH formats Vercel can deliver:
  //  1. Escaped  — "-----BEGIN PRIVATE KEY-----\\nMII..." (from .env files)
  //  2. Literal  — "-----BEGIN PRIVATE KEY-----\nMII..."  (Vercel dashboard parses \n)
  const privateKey = rawKey.includes('\\n')
    ? rawKey.replace(/\\n/g, '\n')
    : rawKey;

  // Strip surrounding quotes that some .env parsers leave in
  const cleanKey = privateKey.replace(/^["']|["']$/g, '');

  try {
    adminApp = initializeApp({
      credential: cert({ projectId, clientEmail, privateKey: cleanKey }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    });
    initError = null;
    return adminApp;
  } catch (err) {
    initError = err instanceof Error ? err.message : 'Firebase Admin init failed';
    throw new Error(`Firebase Admin SDK failed to initialise: ${initError}`);
  }
}

export const adminDb      = () => getFirestore(getAdminApp());
export const adminStorage = () => getStorage(getAdminApp());
export const adminAuth    = () => getAuth(getAdminApp());

/** Returns null if SDK is not initialised yet (safe for health checks) */
export function getAdminInitError(): string | null { return initError; }
