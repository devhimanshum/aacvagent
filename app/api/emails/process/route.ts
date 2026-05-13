import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorized } from '@/lib/utils/auth-middleware';
import {
  adminIsEmailProcessed,
  adminCheckDuplicate,
  adminSaveCandidate,
  adminSaveProcessedEmail,
  adminSaveTokenUsage,
  adminGetRankConfig,
  adminIsKnownDuplicate,
  adminSaveKnownDuplicate,
} from '@/lib/firebase/admin-firestore';
import type { RankConfig } from '@/types';
import {
  fetchAllEmails,
  fetchEmailById,
  fetchEmailAttachments,
  downloadAttachment,
} from '@/lib/outlook/client';
import { extractCVText, isSupportedCVFile } from '@/lib/utils/cv-parser';
import { analyzeCV } from '@/lib/gemini/agent';
import { normalizeRank, ranksMatch as ranksSynonymMatch } from '@/lib/utils/ranks';
import { appendCandidateToSheet } from '@/lib/google/sheets';
// import { uploadCVToStorage } from '@/lib/firebase/storage'; // TODO: enable once Firebase Storage is set up
import type { ProcessEmailResult } from '@/types';

/** True when config rank and CV rank refer to the same position (synonym-aware) */
function ranksMatch(configRank: string, cvRank: string): boolean {
  if (!cvRank) return false;
  return ranksSynonymMatch(configRank, cvRank);
}

// re-export normalizeRank so linter doesn't complain it's unused
void normalizeRank;

/**
 * Evaluates candidate rank history against the active config requirements.
 *
 * - Each enabled requirement is checked against ALL rank history entries.
 * - A requirement is "met" when the rank is present in the CV history.
 * - rankMatchScore = % of enabled requirements met.
 * - rankMatched   = at least one requirement is met.
 */
function checkRankMatch(
  rankHistory: { rank: string; durationMonths?: number }[],
  config: RankConfig | null,
): { rankMatched: boolean; rankMatchScore: number } {
  if (!config || !config.requirements?.length) {
    return { rankMatched: true, rankMatchScore: 100 };
  }

  const active = config.requirements.filter(r => r.enabled);
  if (!active.length) return { rankMatched: true, rankMatchScore: 100 };

  let metCount = 0;

  for (const req of active) {
    const hasRank = rankHistory.some(e => ranksMatch(req.rank, e.rank ?? ''));
    if (hasRank) metCount++;
  }

  const score = Math.round((metCount / active.length) * 100);
  return { rankMatched: metCount > 0, rankMatchScore: score };
}

/**
 * Process a single CV attachment: extract text → AI → duplicate check → save.
 * Returns a ProcessEmailResult for this specific attachment.
 */
async function processSingleAttachment(
  emailId:      string,
  emailSubject: string,
  senderEmail:  string,
  senderName:   string,
  receivedAt:   string,
  attachmentId: string,
  fileName:     string,
  rankConfig:   RankConfig | null,
): Promise<ProcessEmailResult & { name?: string }> {
  // Download & extract text
  const { buffer, contentType, name } = await downloadAttachment(emailId, attachmentId);
  const cvText = await extractCVText(buffer, contentType, name || fileName);

  if (!cvText.trim()) {
    return { emailId, status: 'error', message: `Could not extract text from "${name || fileName}"` };
  }

  // AI analysis
  const { result: aiResult, usage } = await analyzeCV(cvText);

  // Save token usage
  await adminSaveTokenUsage({
    date:          new Date().toISOString().slice(0, 10),
    candidateName: aiResult.name || 'Unknown',
    emailSubject,
    inputTokens:   usage.inputTokens,
    outputTokens:  usage.outputTokens,
    totalTokens:   usage.totalTokens,
    model:         usage.model,
    costUsd:       usage.costUsd,
    processedAt:   new Date().toISOString(),
  });

  // Duplicate check by extracted email
  if (aiResult.email) {
    const isDuplicate = await adminCheckDuplicate(aiResult.email);
    if (isDuplicate) {
      console.log(`[Process] Duplicate rejected: ${aiResult.name} <${aiResult.email}>`);
      // Persist this attachment as a known duplicate so future runs skip it
      // BEFORE AI — no API cost on repeat encounters, even if outlook ID changes.
      adminSaveKnownDuplicate({
        attachmentId:   attachmentId,
        candidateEmail: aiResult.email,
        candidateName:  aiResult.name || '',
        outlookEmailId: emailId,
        fileName:       name || fileName,
      }).catch(() => { /* fire-and-forget, never block the response */ });
      return {
        emailId,
        status:  'skipped',
        name:    aiResult.name,
        message: `Duplicate — ${aiResult.name || aiResult.email} already exists`,
      };
    }
  }

  // Rank config matching
  const { rankMatched, rankMatchScore } = checkRankMatch(aiResult.rankHistory, rankConfig);
  const now = new Date().toISOString();

  const candidateId = await adminSaveCandidate({
    name:                  aiResult.name,
    email:                 aiResult.email,
    phones:                aiResult.phones,
    currentRank:           aiResult.currentRank,
    rankHistory:           aiResult.rankHistory,
    totalSeaServiceMonths: aiResult.totalSeaServiceMonths,
    summary:               aiResult.summary,
    education:             aiResult.education,
    documents:             aiResult.documents,
    cvFileUrl:             '',
    cvFileName:            name || fileName,
    cvAttachmentId:        attachmentId,
    emailId,
    emailSubject,
    senderEmail,
    reviewStatus:          'pending',
    duplicate:             false,
    rankMatched,
    rankMatchScore,
    processedAt:           now,
    createdAt:             now,
  });

  // Append to Google Sheet (fire-and-forget)
  appendCandidateToSheet({
    name:                  aiResult.name,
    email:                 aiResult.email,
    phone:                 aiResult.phones[0] ?? '',
    currentRank:           aiResult.currentRank,
    totalSeaServiceMonths: aiResult.totalSeaServiceMonths,
    rankHistory:           aiResult.rankHistory,
    education:             aiResult.education,
    emailSubject,
    senderEmail,
    cvFileName:            name || fileName,
    reviewStatus:          'pending',
  }).catch((err: unknown) => {
    const e = err as { message?: string; response?: { data?: unknown } };
    console.error('[Google Sheet] Append failed for', aiResult.name, '—', e?.message ?? err);
  });

  return {
    emailId,
    status:      'success',
    candidateId,
    name:        aiResult.name,
    message:     `${aiResult.name} analysed and saved`,
  };
}

/** Save a processed-email record silently — never throws. */
async function markProcessed(
  outlookId: string, subject: string, senderName: string, senderEmail: string,
  receivedAt: string, status: 'processed' | 'skipped' | 'error',
  extra?: Partial<Parameters<typeof adminSaveProcessedEmail>[0]>,
) {
  try {
    await adminSaveProcessedEmail({
      outlookId, subject, senderName, senderEmail, receivedAt,
      processedAt: new Date().toISOString(), status, ...extra,
    });
  } catch {
    /* ignore — we never want a save failure to block the response */
  }
}

async function processEmail(
  emailId:      string,
  emailSubject: string,
  senderEmail:  string,
  senderName:   string,
  receivedAt:   string,
  rankConfig?:  RankConfig | null,
): Promise<ProcessEmailResult> {
  // Skip if this email was already fully processed
  if (await adminIsEmailProcessed(emailId)) {
    return { emailId, status: 'skipped', message: 'Already processed' };
  }

  // Fetch attachments — if this throws we still mark it processed so it never retries forever
  let attachments: Awaited<ReturnType<typeof fetchEmailAttachments>>;
  try {
    attachments = await fetchEmailAttachments(emailId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not fetch attachments';
    await markProcessed(emailId, emailSubject, senderName, senderEmail, receivedAt, 'error', { errorMessage: msg });
    return { emailId, status: 'error', message: msg };
  }

  const cvAttachments = attachments.filter(a => isSupportedCVFile(a.contentType, a.name));

  if (cvAttachments.length === 0) {
    await markProcessed(emailId, emailSubject, senderName, senderEmail, receivedAt,
      'skipped', { errorMessage: 'No PDF/DOCX attachment found' });
    return { emailId, status: 'skipped', message: 'No CV attachment found' };
  }

  // ── Pre-check: skip attachments already known as duplicates (no AI cost) ──
  // Outlook attachment IDs are stable, so this is reliable across sessions even
  // if the email's own ID changes (Microsoft Graph returns mutable IDs in batch mode).
  const dupChecks = await Promise.all(
    cvAttachments.map(a => adminIsKnownDuplicate(a.id)),
  );
  const newAttachments = cvAttachments.filter((_, i) => !dupChecks[i]);
  const preSkipCount   = cvAttachments.length - newAttachments.length;

  if (newAttachments.length === 0) {
    // Every attachment in this email was already identified as a duplicate — skip entirely
    await markProcessed(emailId, emailSubject, senderName, senderEmail, receivedAt,
      'skipped', {
        attachmentName: cvAttachments.map(a => a.name).join(', '),
        errorMessage:   `All ${preSkipCount} CV${preSkipCount > 1 ? 's' : ''} already known as duplicates`,
      });
    return {
      emailId,
      status:  'skipped',
      message: `All ${preSkipCount} CV${preSkipCount > 1 ? 's' : ''} already in database — skipped`,
    };
  }

  // Process only attachments not yet known as duplicates
  const attResults: (ProcessEmailResult & { name?: string })[] = [];

  // Add pre-skipped ones to results for accurate summary
  for (let i = 0; i < preSkipCount; i++) {
    attResults.push({ emailId, status: 'skipped', message: 'Already known duplicate (pre-check)' });
  }

  for (const att of newAttachments) {
    try {
      const r = await processSingleAttachment(
        emailId, emailSubject, senderEmail, senderName, receivedAt,
        att.id, att.name, rankConfig ?? null,
      );
      attResults.push(r);
    } catch (err) {
      attResults.push({
        emailId,
        status:  'error',
        message: err instanceof Error ? err.message : `Failed to process "${att.name}"`,
      });
    }
  }

  // Mark the email as processed (once, regardless of individual attachment outcomes)
  const successResult = attResults.find(r => r.status === 'success');
  const skipCount     = attResults.filter(r => r.status === 'skipped').length;
  const errCount      = attResults.filter(r => r.status === 'error').length;

  // Use 'skipped' not 'error' when all were duplicates — this way retries are
  // treated as clean skips, not failures, in the dashboard/logs.
  const finalStatus = successResult
    ? 'processed'
    : errCount > 0 ? 'error' : 'skipped';

  await markProcessed(emailId, emailSubject, senderName, senderEmail, receivedAt,
    finalStatus, {
      candidateId:    successResult?.candidateId,
      attachmentName: cvAttachments.map(a => a.name).join(', '),
      errorMessage:   successResult ? undefined : attResults.map(r => r.message).join('; '),
    });

  const successCount = attResults.filter(r => r.status === 'success').length;

  if (successCount > 0) {
    const names = attResults.filter(r => r.status === 'success').map(r => r.name).filter(Boolean).join(', ');
    return {
      emailId,
      status:      'success',
      candidateId: successResult?.candidateId,
      message:     `${successCount} CV${successCount > 1 ? 's' : ''} processed${names ? ` (${names})` : ''}${skipCount ? `, ${skipCount} duplicate${skipCount > 1 ? 's' : ''} skipped` : ''}`,
    };
  }

  if (skipCount === attResults.length) {
    return { emailId, status: 'skipped', message: `All ${skipCount} CVs already in database — skipped` };
  }

  return { emailId, status: 'error', message: `${errCount} error${errCount > 1 ? 's' : ''} processing CVs` };
}

export async function POST(req: NextRequest) {
  const uid = await verifyAuthToken(req);
  if (!uid) return unauthorized();

  try {
    const body     = await req.json().catch(() => ({}));
    const { emailId } = body;

    // Fetch rank config once for the whole batch
    const rankConfig = await adminGetRankConfig();

    if (emailId) {
      // Single email — fetch it directly by ID
      let email: Awaited<ReturnType<typeof fetchEmailById>>;
      try {
        email = await fetchEmailById(emailId);
      } catch (err) {
        // fetchEmailById failed — mark as processed so this email stops retrying forever
        const msg = err instanceof Error ? err.message : 'Could not fetch email';
        await markProcessed(emailId, '(unknown)', '', '', new Date().toISOString(), 'error',
          { errorMessage: msg });
        return NextResponse.json({ success: true, data: { emailId, status: 'error', message: msg } });
      }

      // Use the original `emailId` (from the preview/client), NOT email.id from the
      // Graph response — they can differ and cause the processedEmails lookup to miss.
      const result = await processEmail(
        emailId, email.subject,
        email.from.emailAddress.address,
        email.from.emailAddress.name,
        email.receivedDateTime,
        rankConfig,
      );
      return NextResponse.json({ success: true, data: result });
    }

    // Batch — fetch all emails then filter client-side (avoids $filter+$orderby 400)
    const allEmails = await fetchAllEmails(100);
    const emails    = allEmails.filter(e => e.hasAttachments);
    const results: ProcessEmailResult[] = [];

    for (const email of emails) {
      try {
        results.push(await processEmail(
          email.id, email.subject,
          email.from.emailAddress.address,
          email.from.emailAddress.name,
          email.receivedDateTime,
          rankConfig,
        ));
      } catch (err) {
        results.push({
          emailId: email.id, status: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
      summary: {
        processed: results.filter(r => r.status === 'success').length,
        skipped:   results.filter(r => r.status === 'skipped').length,
        errors:    results.filter(r => r.status === 'error').length,
        total:     results.length,
      },
    });
  } catch (err) {
    console.error('POST /api/emails/process error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Processing failed' },
      { status: 500 },
    );
  }
}
