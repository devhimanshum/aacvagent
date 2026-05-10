import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, unauthorized } from '@/lib/utils/auth-middleware';
import {
  adminCheckDuplicate,
  adminSaveCandidate,
  adminSaveTokenUsage,
  adminGetRankConfig,
} from '@/lib/firebase/admin-firestore';
import { extractCVText, isSupportedCVFile } from '@/lib/utils/cv-parser';
import { analyzeCV } from '@/lib/gemini/agent';
import { appendCandidateToSheet } from '@/lib/google/sheets';
import type { RankConfig } from '@/types';

// ── Rank synonym map (mirrors process/route.ts) ───────────────
const RANK_SYNONYMS: Record<string, string[]> = {
  'master':             ['captain', 'master mariner', 'commanding officer', 'cmd', 'capt'],
  'chief officer':      ['c/o', 'chief mate', '1st officer', 'first officer', '1/o', 'chief off'],
  'second officer':     ['2nd officer', '2/o', 'second mate', '2nd mate', 'second off'],
  'third officer':      ['3rd officer', '3/o', 'third mate', '3rd mate', 'third off'],
  'chief engineer':     ['c/e', 'chief eng', 'chief engr', '1st engineer', '1/e'],
  'second engineer':    ['2nd engineer', '2/e', 'second engr', '2nd engr'],
  'third engineer':     ['3rd engineer', '3/e', 'third engr', '3rd engr'],
  'fourth engineer':    ['4th engineer', '4/e', 'fourth engr', '4th engr'],
  'electrical officer': ['eto', 'electro technical officer', 'electro-technical officer', 'elec officer'],
  'bosun':              ['boatswain', "bo'sun", 'bosun/ab'],
  'able seaman':        ['ab', 'a.b.', 'able bodied', 'able-bodied seaman'],
  'ordinary seaman':    ['os', 'o.s.', 'ord seaman'],
  'motorman':           ['motor man', 'moterman'],
  'oiler':              ['wiper', 'engine room rating'],
  'cook':               ['chief cook', 'ship cook'],
  'pump man':           ['pumpman'],
};

function normalizeRank(rank: string): string {
  return rank.toLowerCase().replace(/[^a-z0-9/]/g, ' ').replace(/\s+/g, ' ').trim();
}

function canonicalRank(rank: string): string {
  const n = normalizeRank(rank);
  for (const [canon, aliases] of Object.entries(RANK_SYNONYMS)) {
    if (n === canon || aliases.includes(n)) return canon;
    if (n.includes(canon) || aliases.some(a => n.includes(a))) return canon;
  }
  return n;
}

function ranksMatch(configRank: string, cvRank: string): boolean {
  if (!cvRank) return false;
  return canonicalRank(configRank) === canonicalRank(cvRank);
}

function checkRankMatch(
  rankHistory: { rank: string; durationMonths?: number }[],
  config: RankConfig | null,
): { rankMatched: boolean; rankMatchScore: number } {
  if (!config?.requirements?.length) return { rankMatched: true, rankMatchScore: 100 };
  const active = config.requirements.filter(r => r.enabled);
  if (!active.length) return { rankMatched: true, rankMatchScore: 100 };
  let metCount = 0;
  for (const req of active) {
    if (rankHistory.some(e => ranksMatch(req.rank, e.rank ?? ''))) metCount++;
  }
  const score = Math.round((metCount / active.length) * 100);
  return { rankMatched: metCount > 0, rankMatchScore: score };
}

// ── Route handler ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const uid = await verifyAuthToken(req);
  if (!uid) return unauthorized();

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, status: 'error', message: 'No file provided' }, { status: 400 });
    }

    const fileName    = file.name;
    const contentType = file.type || 'application/octet-stream';

    // Validate file type
    if (!isSupportedCVFile(contentType, fileName)) {
      return NextResponse.json({
        success: true, status: 'error',
        message: `"${fileName}" is not supported. Upload PDF or DOCX files only.`,
      });
    }

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    // Extract text from CV
    const cvText = await extractCVText(buffer, contentType, fileName);
    if (!cvText.trim()) {
      return NextResponse.json({
        success: true, status: 'error',
        message: 'Could not extract text — the file may be a scanned image or password-protected.',
      });
    }

    // AI analysis
    const { result: aiResult, usage } = await analyzeCV(cvText);

    // Track token usage
    const today = new Date().toISOString().slice(0, 10);
    await adminSaveTokenUsage({
      date:          today,
      candidateName: aiResult.name || 'Unknown',
      emailSubject:  `Manual Upload: ${fileName}`,
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
        return NextResponse.json({
          success: true,
          status:  'duplicate',
          message: `Duplicate — ${aiResult.name || aiResult.email} already exists in the system.`,
        });
      }
    }

    // Rank config matching
    const rankConfig = await adminGetRankConfig();
    const { rankMatched, rankMatchScore } = checkRankMatch(aiResult.rankHistory, rankConfig);

    const now      = new Date().toISOString();
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Save to Firestore pending collection
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
      cvFileName:            fileName,
      cvAttachmentId:        '',        // no Outlook attachment for uploads
      emailId:               uploadId,  // synthetic ID
      emailSubject:          `Manual Upload: ${fileName}`,
      senderEmail:           aiResult.email || '',
      reviewStatus:          'pending',
      duplicate:             false,
      rankMatched,
      rankMatchScore,
      processedAt:           now,
      createdAt:             now,
    });

    // Fire-and-forget: append to Google Sheet
    appendCandidateToSheet({
      name:                  aiResult.name,
      email:                 aiResult.email,
      phone:                 aiResult.phones[0] ?? '',
      currentRank:           aiResult.currentRank,
      totalSeaServiceMonths: aiResult.totalSeaServiceMonths,
      rankHistory:           aiResult.rankHistory,
      education:             aiResult.education,
      emailSubject:          `Manual Upload: ${fileName}`,
      senderEmail:           aiResult.email || '',
      cvFileName:            fileName,
      reviewStatus:          'pending',
    }).catch((err: unknown) => {
      console.error('[Upload] Google Sheet append failed:', (err as Error)?.message ?? err);
    });

    return NextResponse.json({
      success:     true,
      status:      'success',
      candidateId,
      candidate: {
        name:                  aiResult.name,
        currentRank:           aiResult.currentRank,
        email:                 aiResult.email,
        totalSeaServiceMonths: aiResult.totalSeaServiceMonths,
        rankMatched,
        rankMatchScore,
      },
      message: `${aiResult.name || 'Candidate'} processed and added to Selected`,
    });

  } catch (err) {
    console.error('POST /api/cv/upload error:', err);
    return NextResponse.json(
      { success: false, status: 'error', message: err instanceof Error ? err.message : 'Processing failed' },
      { status: 500 },
    );
  }
}
