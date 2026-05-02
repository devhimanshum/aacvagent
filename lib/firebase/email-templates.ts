import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './admin';
import type { EmailTemplate } from '@/types';

const COL = 'emailTemplates';

function toTemplate(snap: FirebaseFirestore.DocumentSnapshot): EmailTemplate {
  const d = snap.data() ?? {};
  return {
    id:        snap.id,
    name:      String(d.name ?? ''),
    subject:   String(d.subject ?? ''),
    body:      String(d.body ?? ''),
    createdAt: d.createdAt instanceof Object && 'toDate' in d.createdAt
      ? (d.createdAt as FirebaseFirestore.Timestamp).toDate().toISOString()
      : String(d.createdAt ?? new Date().toISOString()),
    updatedAt: String(d.updatedAt ?? new Date().toISOString()),
  };
}

export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  const db   = adminDb();
  const snap = await db.collection(COL).orderBy('createdAt', 'desc').get();
  return snap.docs.map(toTemplate);
}

export async function saveEmailTemplate(
  tpl: Omit<EmailTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<string> {
  const db  = adminDb();
  const now = new Date().toISOString();

  if (tpl.id) {
    await db.collection(COL).doc(tpl.id).set(
      { name: tpl.name, subject: tpl.subject, body: tpl.body, updatedAt: now },
      { merge: true },
    );
    return tpl.id;
  }

  const ref = await db.collection(COL).add({
    name: tpl.name, subject: tpl.subject, body: tpl.body,
    createdAt: FieldValue.serverTimestamp(), updatedAt: now,
  });
  return ref.id;
}

export async function deleteEmailTemplate(id: string): Promise<void> {
  const db = adminDb();
  await db.collection(COL).doc(id).delete();
}
