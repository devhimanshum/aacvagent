import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorized } from '@/lib/utils/auth-middleware';
import { getEmailTemplates, saveEmailTemplate, deleteEmailTemplate } from '@/lib/firebase/email-templates';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const uid = await verifyAuthToken(req);
  if (!uid) return unauthorized();
  try {
    const templates = await getEmailTemplates();
    return NextResponse.json({ success: true, data: templates });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const uid = await verifyAuthToken(req);
  if (!uid) return unauthorized();
  try {
    const body = await req.json();
    if (body.action === 'delete') {
      if (!body.id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
      await deleteEmailTemplate(body.id);
      return NextResponse.json({ success: true });
    }
    if (body.action === 'save') {
      const { template } = body;
      if (!template?.name || !template?.subject || !template?.body)
        return NextResponse.json({ success: false, error: 'name, subject, body required' }, { status: 400 });
      const id = await saveEmailTemplate(template);
      return NextResponse.json({ success: true, data: { id } });
    }
    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
