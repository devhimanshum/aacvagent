import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorized } from '@/lib/utils/auth-middleware';
import {
  adminIsEmailProcessed,
  adminCheckDuplicate,
  adminSaveCandidate,
  adminSaveProcessedEmail,
  adminSaveTokenUsage,
  adminGetRankConfig,
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
import { appendCandidateToSheet } from '@/lib/google/sheets';
// import { uploadCVToStorage } from '@/lib/firebase/storage'; // TODO: enable once Firebase Storage is set up
import type { ProcessEmailResult } from '@/types';

/* ─── Maritime rank synonym map ───────────────────────────────
   Each key is the canonical name; values are aliases that should
   be treated as the same rank.  All comparisons are lower-case. */
const RANK_SYNONYMS: Record<string, string[]> = {
  'master':           ['captain', 'master mariner', 'commanding officer', 'cmd', 'capt'],
  'chief officer':    ['c/o', 'chief mate', '1st officer', 'first officer', '1/o', 'chief off'],
  'second officer':   ['2nd officer', '2/o', 'second mate', '2nd mate', 'second off'],
  'third officer':    ['3rd officer', '3/o', 'third mate', '3rd mate', 'third off'],
  'chief engineer':   ['c/e', 'chief eng', 'chief engr', '1st engineer', '1/e'],
  'second engineer':  ['2nd engineer', '2/e', 'second engr', '2nd engr'],
  'third engineer':   ['3rd engineer', '3/e', 'third engr', '3rd engr'],
  'fourth engineer':  ['4th engineer', '4/e', 'fourth engr', '4th engr'],
  'electrical officer': ['eto', 'electro technical officer', 'electro-technical officer', 'elec officer'],
  'bosun':            ['boatswain', "bo'sun", 'bosun/ab'],
  'able seaman':      ['ab', 'a.b.', 'able bodied', 'able-bodied seaman'],
  'ordinary seaman':  ['os', 'o.s.', 'ord seaman'],
  'motorman':         ['motor man', 'moterman'],
  'oiler':            ['wiper', 'engine room rating'],
  'cook':             ['chief cook', 'ship cook'],
  'pump man':         ['pumpman'],
};

/** Normalise a rank string for comparison */
function normalizeRank(rank: string): string {
  return rank.toLowerCase().replace(/[^a-z0-9/]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Resolve a rank string to its canonical form (or itself if not found) */
function canonicalRank(rank: string): string {
  const n = normalizeRank(rank);
  for (const [canon, aliases] of Object.entries(RANK_SYNONYMS)) {
    if (n === canon || aliases.includes(n)) return canon;
    // partial containment check (handles "Chief Officer Grade I" etc.)
    if (n.includes(canon) || aliases.some(a => n.includes(a))) return canon;
  }
  return n;
}

/** True when two rank strings refer to the same position */
function ranksMatch(configRank: string, cvRank: string): boolean {
  if (!cvRank) return false;
  return canonicalRank(configRank) === canonicalRank(cvRank);
}

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

  // Find ALL CV attachments in the email
  const attachments    = await fetchEmailAttachments(emailId);
  const cvAttachments  = attachments.filter(a => isSupportedCVFile(a.contentType, a.name));

  if (cvAttachments.length === 0) {
    await adminSaveProcessedEmail({
      outlookId: emailId, subject: emailSubject, senderName, senderEmail,
      receivedAt, processedAt: new Date().toISOString(),
      status: 'skipped', errorMessage: 'No PDF/DOCX attachment found',
    });
    return { emailId, status: 'skipped', message: 'No CV attachment found' };
  }

  // Process every CV attachment
  const attResults: (ProcessEmailResult & { name?: string })[] = [];
  for (const att of cvAttachments) {
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
  const now           = new Date().toISOString();
  await adminSaveProcessedEmail({
    outlookId:      emailId,
    subject:        emailSubject,
    senderName,
    senderEmail,
    receivedAt,
    processedAt:    now,
    status:         successResult ? 'processed' : 'skipped',
    candidateId:    successResult?.candidateId,
    attachmentName: cvAttachments.map(a => a.name).join(', '),
    errorMessage:   successResult ? undefined
      : attResults.map(r => r.message).join('; '),
  });

  const successCount = attResults.filter(r => r.status === 'success').length;
  const skipCount    = attResults.filter(r => r.status === 'skipped').length;
  const errCount     = attResults.filter(r => r.status === 'error').length;

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
    return { emailId, status: 'skipped', message: `All ${skipCount} CVs are duplicates — skipped` };
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
      // Single email — fetch it directly by ID, no list lookup needed
      const email = await fetchEmailById(emailId);
      const result = await processEmail(
        email.id, email.subject,
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
