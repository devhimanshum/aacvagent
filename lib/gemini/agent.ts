import OpenAI from 'openai';
import type { MaritimeAIResult, MaritimeDocument, RankEntry } from '@/types';
import { withRetry } from '@/lib/utils/helpers';
import { getOpenAISettings } from '@/lib/firebase/integration-settings';
import { MARITIME_RANKS } from '@/lib/utils/ranks';

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

async function getOpenAIConfig() {
  // 1. Try Firestore (set via Settings page in the app)
  const stored = await getOpenAISettings();
  if (stored?.apiKey) return { apiKey: stored.apiKey, model: stored.model || 'gpt-4o-mini' };

  // 2. Fall back to environment variable
  const apiKey = process.env.OPENAI_API_KEY || '';
  const model  = process.env.OPENAI_MODEL   || 'gpt-4o-mini';

  if (!apiKey || apiKey.includes('PASTE') || apiKey === 'undefined') {
    throw new Error(
      'OpenAI API key is not configured. Go to Settings → Connections and enter your OpenAI API key.',
    );
  }
  return { apiKey, model };
}

// MARITIME_RANKS imported from @/lib/utils/ranks

function buildPrompt(cvText: string): string {
  const today     = new Date();
  const todayYear = today.getFullYear();
  const todayMonth= today.getMonth() + 1; // 1-based
  const todayLabel= today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return `You are an expert maritime HR recruiter with deep knowledge of seafarer CVs.
Analyze the CV below and extract structured data with PRECISE duration calculations.

TODAY'S DATE: ${todayLabel} (Year=${todayYear}, Month=${todayMonth})

## Maritime Ranks Reference (use the closest match)
${MARITIME_RANKS.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## CV Content
${cvText.substring(0, 12000)}

## CRITICAL INSTRUCTIONS — READ CAREFULLY

### Duration calculation rules (MUST follow exactly):
- Parse "from" and "to" dates to determine the NUMBER OF COMPLETE MONTHS.
- Formula: durationMonths = (toYear − fromYear) × 12 + (toMonth − fromMonth)
  - If toMonth < fromMonth, borrow: durationMonths = (toYear − fromYear − 1) × 12 + (12 + toMonth − fromMonth)
- If "to" is blank, "Present", "Till date", "Current", "Ongoing" → use today: Year=${todayYear}, Month=${todayMonth}
- If only years are given (e.g. "2018–2021") → assume Jan of start year to Dec of end year
- If a month+year is given (e.g. "June 2019") → use that month exactly
- NEVER leave durationMonths as 0 if you can see dates. Minimum 1 if the candidate worked that role.
- Mark isPresentRole = true ONLY for the ONE currently active role (where "to" = Present/Current)

### Rank matching rules:
- Always map the extracted rank to the CLOSEST entry in the Maritime Ranks Reference list.
- If no close match exists, keep the original rank text.
- Do NOT invent ranks not present in the CV.

### totalSeaServiceMonths:
- Set this to the SUM of ALL individual durationMonths values.
- Double-check: if individual entries sum to X, totalSeaServiceMonths must equal X.

### Vessel type rules:
- For each rank history entry, extract the type/category of ship (NOT the vessel name).
  Common types: Bulk Carrier, Oil Tanker, Chemical Tanker, Product Tanker, VLCC, ULCC,
  LNG Carrier, LPG Carrier, Container Ship, General Cargo, Ro-Ro, Car Carrier, Passenger,
  Offshore Supply Vessel (OSV), AHTS, Platform Supply Vessel (PSV), Dredger, Reefer, etc.
- Look for columns or fields labelled "Type", "Type of Ship", "Vessel Type", "Ship Type",
  "Type of Vessel", or any similar label in the sea-service table.
- If the vessel type is not stated for an entry, leave vesselType as "".
- Never confuse vessel name with vessel type.

### Other rules:
- Extract ALL sea-service entries from the CV — do not skip any.
- Education: include CoC grade, STCW certificates, flag state endorsements.
- Summary: 2–3 sentences focusing on rank, experience, vessel types.
- Phones: extract up to 2 phone/mobile numbers from the CV. Return as an array of strings. If none, return [].
- Documents: look for a documents / certificates table in the CV and extract:
  • PASSPORT — the seafarer's travel passport
  • CDC — Continuous Discharge Certificate (also written as C.D.C., C.D.C. INDIAN, INDIAN CDC, Indian C.D.C.)
  • COC — Certificate of Competency
  • COP — Certificate of Proficiency
  For each document found, extract: number, issueDate, expiryDate (use "LIFE TIME" or "N/A" as-is if that is what the CV says), placeOfIssue.
  If a document is not present in the CV, omit its key entirely.

Respond ONLY with a valid JSON object — no markdown, no code fences, no explanation:

{
  "name": "Full Name",
  "email": "email@example.com",
  "phones": ["+919876543210", "+917012345678"],
  "currentRank": "Chief Engineer",
  "rankHistory": [
    {
      "rank": "Chief Engineer",
      "vessel": "MV Pacific Star",
      "vesselType": "Bulk Carrier",
      "company": "Pacific Shipping Ltd",
      "from": "March 2022",
      "to": "Present",
      "durationMonths": 26,
      "isPresentRole": true
    },
    {
      "rank": "Second Engineer",
      "vessel": "MT Ocean Blue",
      "vesselType": "Oil Tanker",
      "company": "Blue Ocean Shipping",
      "from": "January 2019",
      "to": "February 2022",
      "durationMonths": 37,
      "isPresentRole": false
    }
  ],
  "totalSeaServiceMonths": 63,
  "education": "B.Sc Marine Engineering, CoC Class 1 MEO, STCW Basic Safety Training",
  "summary": "Experienced Chief Engineer with 5+ years on tankers and bulk carriers.",
  "documents": {
    "passport": { "number": "W5419757", "issueDate": "29.12.2022", "expiryDate": "28.12.2032", "placeOfIssue": "JAIPUR" },
    "cdc":      { "number": "MUM155109", "issueDate": "12.11.2020", "expiryDate": "11.11.2030", "placeOfIssue": "MUMBAI" },
    "coc":      { "number": "CC/MUM/2651", "issueDate": "18.08.2017", "expiryDate": "LIFE TIME", "placeOfIssue": "MUMBAI" },
    "cop":      { "number": "ABE26009540", "issueDate": "26.02.2026", "expiryDate": "N/A", "placeOfIssue": "MUMBAI" }
  }
}`;
}

function safeRankEntry(r: Partial<RankEntry>): RankEntry {
  return {
    rank:           String(r.rank       || '').trim(),
    vessel:         String(r.vessel     || '').trim(),
    vesselType:     String(r.vesselType || '').trim(),
    company:        String(r.company    || '').trim(),
    from:           String(r.from       || '').trim(),
    to:             String(r.to         || '').trim(),
    durationMonths: Math.max(0, Number(r.durationMonths) || 0),
    isPresentRole:  Boolean(r.isPresentRole),
  };
}

function safeDoc(raw: unknown): MaritimeDocument | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const d = raw as Record<string, unknown>;
  return {
    number:       String(d.number       || '').trim(),
    issueDate:    String(d.issueDate    || '').trim(),
    expiryDate:   String(d.expiryDate   || '').trim(),
    placeOfIssue: String(d.placeOfIssue || '').trim(),
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

  // Recalculate totalSeaServiceMonths from individual entries (overrides AI arithmetic).
  const summedMonths          = rankHistory.reduce((acc, r) => acc + (r.durationMonths ?? 0), 0);
  const aiTotal               = Number(parsed.totalSeaServiceMonths) || 0;
  const totalSeaServiceMonths = Math.max(summedMonths, aiTotal);

  // Phones — accept array or legacy single string
  let phones: string[] = [];
  if (Array.isArray(parsed.phones)) {
    phones = (parsed.phones as unknown[])
      .map(p => String(p || '').trim())
      .filter(Boolean)
      .slice(0, 2);
  } else if (parsed.phone) {
    phones = [String(parsed.phone).trim()].filter(Boolean);
  }

  // Documents
  const rawDocs = parsed.documents ?? {};
  const documents = {
    ...(safeDoc(rawDocs.passport) ? { passport: safeDoc(rawDocs.passport)! } : {}),
    ...(safeDoc(rawDocs.cdc)      ? { cdc:      safeDoc(rawDocs.cdc)!      } : {}),
    ...(safeDoc(rawDocs.coc)      ? { coc:      safeDoc(rawDocs.coc)!      } : {}),
    ...(safeDoc(rawDocs.cop)      ? { cop:      safeDoc(rawDocs.cop)!      } : {}),
  };

  return {
    name:                  String(parsed.name || 'Unknown').trim(),
    email:                 String(parsed.email || '').trim().toLowerCase(),
    phones,
    currentRank:           String(parsed.currentRank || rankHistory[0]?.rank || '').trim(),
    rankHistory,
    totalSeaServiceMonths,
    education:             String(parsed.education || 'Not specified').trim(),
    summary:               String(parsed.summary || '').trim(),
    documents,
  };
}

export async function analyzeCV(cvText: string): Promise<{ result: MaritimeAIResult; usage: AIUsage }> {
  if (!cvText.trim()) throw new Error('CV text is empty');

  const { apiKey, model } = await getOpenAIConfig();
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
