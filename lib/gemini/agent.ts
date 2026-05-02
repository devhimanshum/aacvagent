import OpenAI from 'openai';
import type { MaritimeAIResult, RankEntry } from '@/types';
import { withRetry } from '@/lib/utils/helpers';

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  costUsd: number;
}

// gpt-4o-mini pricing: $0.150/1M input, $0.600/1M output
function calcCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 0.00000015) + (outputTokens * 0.0000006);
}

function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY || '';
  const model  = process.env.OPENAI_MODEL   || 'gpt-4o-mini';

  if (!apiKey || apiKey.includes('PASTE') || apiKey === 'undefined') {
    throw new Error(
      'OPENAI_API_KEY is not configured. ' +
      'Go to Vercel → Project Settings → Environment Variables → add OPENAI_API_KEY, then redeploy.',
    );
  }
  return { apiKey, model };
}

const MARITIME_RANKS = [
  'Master', 'Chief Officer', 'Second Officer', 'Third Officer', 'Deck Cadet',
  'Chief Engineer', 'Second Engineer', 'Third Engineer', 'Fourth Engineer',
  'TME/Fifth Engineer', 'Electrical Officer - COC', 'Electrical Officer - without COC',
  'Electrical Cadet', 'Fitter', 'Bosun', 'AB Deck', 'AB Engine',
  'Ordinary Seamen', 'Wiper', 'Gas Engineer', 'Pumpman', 'Chief Cook',
  'Messman/GS/Asst. Cook',
];

function buildPrompt(cvText: string): string {
  return `You are an expert maritime HR recruiter. Analyze the following seafarer CV/resume and extract all relevant information.

## Maritime Ranks Reference
${MARITIME_RANKS.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## CV Content
${cvText.substring(0, 10000)}

## Instructions
1. Extract the candidate's personal details (name, email, phone).
2. Extract every position/rank held from their sea service history:
   - Match the rank to the closest rank from the reference list above (or keep original if no match).
   - Extract vessel name, company name, start date, end date.
   - Calculate duration in months (if "to" is "Present" or "Ongoing", calculate to today: ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}).
   - Mark isPresentRole = true only for their current active position.
3. Identify their current/most recent rank.
4. Sum total sea service in months across all ranks.
5. Extract education, certificates of competency (CoC), STCW endorsements.
6. Write a concise 2-3 sentence professional summary.

Respond ONLY with a valid JSON object — no markdown, no explanation, just raw JSON:

{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "+1234567890",
  "currentRank": "Chief Engineer",
  "rankHistory": [
    {
      "rank": "Chief Engineer",
      "vessel": "MV Pacific Star",
      "company": "Pacific Shipping Ltd",
      "from": "March 2022",
      "to": "Present",
      "durationMonths": 26,
      "isPresentRole": true
    }
  ],
  "totalSeaServiceMonths": 120,
  "education": "B.Sc Marine Engineering, CoC Class 1 MEO, STCW Basic Safety",
  "summary": "Experienced Chief Engineer with over 10 years of deep-sea service."
}`;
}

function safeRankEntry(r: Partial<RankEntry>): RankEntry {
  return {
    rank:           String(r.rank || ''),
    vessel:         String(r.vessel || ''),
    company:        String(r.company || ''),
    from:           String(r.from || ''),
    to:             String(r.to || ''),
    durationMonths: Number(r.durationMonths) || 0,
    isPresentRole:  Boolean(r.isPresentRole),
  };
}

function parseResponse(raw: string): MaritimeAIResult {
  const cleaned = raw.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '');

  const parsed = JSON.parse(cleaned);

  const rankHistory: RankEntry[] = Array.isArray(parsed.rankHistory)
    ? (parsed.rankHistory as Partial<RankEntry>[]).map(safeRankEntry).filter(r => r.rank)
    : [];

  return {
    name:                  String(parsed.name || 'Unknown'),
    email:                 String(parsed.email || ''),
    phone:                 String(parsed.phone || ''),
    currentRank:           String(parsed.currentRank || rankHistory[0]?.rank || ''),
    rankHistory,
    totalSeaServiceMonths: Number(parsed.totalSeaServiceMonths) || 0,
    education:             String(parsed.education || 'Not specified'),
    summary:               String(parsed.summary || ''),
  };
}

export async function analyzeCV(cvText: string): Promise<{ result: MaritimeAIResult; usage: AIUsage }> {
  if (!cvText.trim()) throw new Error('CV text is empty');

  const { apiKey, model } = getOpenAIConfig();
  const client = new OpenAI({ apiKey });

  return withRetry(async () => {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You are an expert maritime HR recruiter. Always respond with valid JSON only.' },
        { role: 'user',   content: buildPrompt(cvText) },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content      = response.choices[0]?.message?.content || '';
    const inputTokens  = response.usage?.prompt_tokens     ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const totalTokens  = response.usage?.total_tokens      ?? 0;

    return {
      result: parseResponse(content),
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        model,
        costUsd: calcCost(inputTokens, outputTokens),
      },
    };
  }, 3, 2000);
}
