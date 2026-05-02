import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorized } from '@/lib/utils/auth-middleware';
import { sendEmail } from '@/lib/outlook/mailer';

export const dynamic = 'force-dynamic';

function substitute(text: string, candidate: { name: string; currentRank?: string }): string {
  const firstName = candidate.name.split(' ')[0] ?? candidate.name;
  return text
    .replace(/\{\{name\}\}/gi, candidate.name)
    .replace(/\{\{firstName\}\}/gi, firstName)
    .replace(/\{\{rank\}\}/gi, candidate.currentRank ?? '');
}

export async function POST(req: NextRequest) {
  const uid = await verifyAuthToken(req);
  if (!uid) return unauthorized();

  try {
    const { recipients, subject, body } = await req.json() as {
      recipients: { id: string; name: string; email: string; currentRank?: string }[];
      subject: string;
      body: string;
    };

    if (!Array.isArray(recipients) || !subject || !body)
      return NextResponse.json({ success: false, error: 'recipients, subject, body required' }, { status: 400 });

    const results = await Promise.all(
      recipients.map(async (r) => {
        try {
          await sendEmail({
            to:      r.email,
            toName:  r.name,
            subject: substitute(subject, r),
            body:    substitute(body, r),
          });
          return { id: r.id, email: r.email, status: 'sent' as const };
        } catch (err) {
          return {
            id:     r.id,
            email:  r.email,
            status: 'failed' as const,
            error:  err instanceof Error ? err.message : 'Unknown error',
          };
        }
      }),
    );

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
