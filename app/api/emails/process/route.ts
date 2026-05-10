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

async function processEmail(
  emailId: string,
  emailSubject: string,
  senderEmail: string,
  senderName: string,
  receivedAt: string,
  rankConfig?: RankConfig | null,
): Promise<ProcessEmailResult> {
  // Skip already-processed
  if (await adminIsEmailProcessed(emailId)) {
    return { emailId, status: 'skipped', message: 'Already processed' };
  }

  // Early duplicate check by sender email (saves download + AI tokens)
  if (senderEmail) {
    const earlyDup = await adminCheckDuplicate(senderEmail);
    if (earlyDup) {
      await adminSaveProcessedEmail({
        outlookId: emailId, subject: emailSubject, senderName, senderEmail,
        receivedAt, processedAt: new Date().toISOString(),
        status: 'skipped',
        errorMessage: `Duplicate — sender "${senderEmail}" already has a candidate record`,
      });
      console.log(`[Process] Early duplicate rejected by sender: ${senderEmail}`);
      return {
        emailId,
        status: 'skipped',
        message: `Duplicate — ${senderName || senderEmail} already exists`,
      };
    }
  }

  // Find a CV attachment
  const attachments  = await fetchEmailAttachments(emailId);
  const cvAttachment = attachments.find(a => isSupportedCVFile(a.contentType, a.name));

  if (!cvAttachment) {
    await adminSaveProcessedEmail({
      outlookId: emailId, subject: emailSubject, senderName, senderEmail,
      receivedAt, processedAt: new Date().toISOString(),
      status: 'skipped', errorMessage: 'No PDF/DOCX attachment found',
    });
    return { emailId, status: 'skipped', message: 'No CV attachment found' };
  }

  // Download & extract text
  const { buffer, contentType, name } = await downloadAttachment(emailId, cvAttachment.id);
  const cvText = await extractCVText(buffer, contentType, name);

  if (!cvText.trim()) {
    await adminSaveProcessedEmail({
      outlookId: emailId, subject: emailSubject, senderName, senderEmail,
      receivedAt, processedAt: new Date().toISOString(),
      status: 'error', errorMessage: 'Could not extract text from CV', attachmentName: name,
    });
    return { emailId, status: 'error', message: 'CV text extraction failed' };
  }

  // No Firebase Storage — store attachment reference for on-demand fetch
  const cvFileUrl      = '';             // not using storage
  const cvAttachmentId = cvAttachment.id; // Outlook attachment ID

  // AI analysis — extracts rank history, personal info, sea service
  const { result: aiResult, usage } = await analyzeCV(cvText);

  // Save token usage record
  const today = new Date().toISOString().slice(0, 10);
  await adminSaveTokenUsage({
    date:          today,
    candidateName: aiResult.name || 'Unknown',
    emailSubject,
    inputTokens:   usage.inputTokens,
    outputTokens:  usage.outputTokens,
    totalTokens:   usage.totalTokens,
    model:         usage.model,
    costUsd:       usage.costUsd,
    processedAt:   new Date().toISOString(),
  });

  // ── Duplicate check — reject before saving anything ──────────
  // If a candidate with the same email already exists in any collection,
  // mark the email processed (so it is never re-attempted) and skip.
  if (aiResult.email) {
    const isDuplicate = await adminCheckDuplicate(aiResult.email);
    if (isDuplicate) {
      await adminSaveProcessedEmail({
        outlookId: emailId, subject: emailSubject, senderName, senderEmail,
        receivedAt, processedAt: new Date().toISOString(),
        status: 'skipped',
        attachmentName: name,
        errorMessage: `Duplicate — candidate with email "${aiResult.email}" already exists`,
      });
      console.log(`[Process] Duplicate rejected: ${aiResult.name} <${aiResult.email}>`);
      return {
        emailId,
        status: 'skipped',
        message: `Duplicate candidate — ${aiResult.name || aiResult.email} already exists`,
      };
    }
  }

  // Rank config matching
  const { rankMatched, rankMatchScore } = checkRankMatch(aiResult.rankHistory, rankConfig ?? null);

  const now = new Date().toISOString();

  // Save candidate to PENDING (awaiting admin review)
  const candidateId = await adminSaveCandidate({
    name:                  aiResult.name,
    email:                 aiResult.email,
    phone:                 aiResult.phone,
    currentRank:           aiResult.currentRank,
    rankHistory:           aiResult.rankHistory,
    totalSeaServiceMonths: aiResult.totalSeaServiceMonths,
    summary:               aiResult.summary,
    education:             aiResult.education,
    cvFileUrl,
    cvFileName:            name,
    cvAttachmentId,
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

  await adminSaveProcessedEmail({
    outlookId: emailId, subject: emailSubject, senderName, senderEmail,
    receivedAt, processedAt: now,
    status: 'processed', candidateId, attachmentName: name,
  });

  // Append to Google Sheet (fire-and-forget — never blocks CV processing)
  appendCandidateToSheet({
    name:                  aiResult.name,
    email:                 aiResult.email,
    phone:                 aiResult.phone,
    currentRank:           aiResult.currentRank,
    totalSeaServiceMonths: aiResult.totalSeaServiceMonths,
    rankHistory:           aiResult.rankHistory,
    education:             aiResult.education,
    emailSubject,
    senderEmail,
    cvFileName:            name,
    reviewStatus:          'pending',
  }).catch((err: unknown) => {
    const e = err as { code?: number; message?: string; response?: { data?: unknown } };
    console.error('[Google Sheet] Append failed for', aiResult.name, '—', e?.message ?? err);
    if (e?.response?.data) console.error('[Google Sheet] API detail:', JSON.stringify(e.response.data));
  });

  return { emailId, status: 'success', candidateId, message: 'CV analysed and added to Selected' };
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
