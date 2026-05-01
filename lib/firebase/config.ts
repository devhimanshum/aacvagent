import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase client config — these values are intentionally public.
// They identify your Firebase project and appear in the browser JS bundle
// regardless of how they are set. Security is enforced by Firebase Security
// Rules, not by keeping this config secret.
const firebaseConfig = {
  apiKey:            'AIzaSyCFwcd1DppoRgKhVNWi6IRlMvuONajiU58',
  authDomain:        'cv-agent-cfac1.firebaseapp.com',
  projectId:         'cv-agent-cfac1',
  storageBucket:     'cv-agent-cfac1.firebasestorage.app',
  messagingSenderId: '970714950602',
  appId:             '1:970714950602:web:473f5ac067e0eba2883d33',
};

const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);
export default app;
