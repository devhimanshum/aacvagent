/**
 * Single source of truth for maritime ranks across:
 * - AI extraction prompt  (MARITIME_RANKS)
 * - Email / upload processing  (ranksMatch)
 * - Rank config form  (MARITIME_RANKS)
 * - Candidate filters  (RANK_GROUPS, rankMatchesQuery)
 */

// ── Canonical rank names — 28 ranks in display order ─────────
export const MARITIME_RANKS = [
  'Master',
  'Chief Officer',
  'Third Officer',
  'Second Officer',
  'Deck Cadet',
  'Chief Engineer',
  'Second Engineer',
  'Third Engineer',
  'Fourth Engineer',
  'Fifth Engineer',
  'Electrical Officer',
  'Electrical Cadet',
  'Bosun',
  'Able Seafarer Deck',
  'Ordinary Seamen',
  'Motorman',
  'Wiper',
  'Fitter',
  'Gas Engineer',
  'Cargo Engineer',
  'Chief Cook',
  'General Steward',
  'Pumpman',
  'Trainee Messman',
  'Riding Crew',
  'Junior Fourth Engineer',
  'Junior Third Officer',
  'Cadet',
] as const;

export type CanonicalRank = typeof MARITIME_RANKS[number];

// ── Aliases: normalizeRank(canonical) → all known variants ───
// Keys must exactly match normalizeRank() applied to each canonical name.
export const RANK_ALIASES: Record<string, string[]> = {
  'master': [
    'captain', 'capt', 'capt.', 'master mariner', 'commanding officer',
    'cmd', 'm/m', 'ship master', 'vessel master',
  ],
  'chief officer': [
    'co', 'c/o', 'c.o.', 'chief mate', 'chief off',
    '1st officer', 'first officer', '1/o', '1st off',
    'chief officer mate',
  ],
  'third officer': [
    '3rd officer', '3o', '3/o', '3rd off', 'third off',
    '3rd ofcr', 'third mate', '3rd mate',
  ],
  'second officer': [
    '2nd officer', '2o', '2/o', '2nd off', 'second off',
    '2nd ofcr', 'second mate', '2nd mate', 'navigating officer',
  ],
  'deck cadet': [
    'navigating cadet', 'cadet (deck)', 'deck officer cadet',
    'trainee deck officer', 'junior officer deck', 'deck trainee',
    'cadet officer deck',
  ],
  'chief engineer': [
    'ce', 'c/e', 'c.e.', 'chief eng', 'chief engr', 'chief engg',
    '1st engineer', 'first engineer', '1/e', '1st engr',
    'chief engineer officer',
  ],
  'second engineer': [
    '2nd engineer', '2e', '2/e', 'second engr', '2nd engr',
    '2nd engg', '2nd eng', 'second engineer officer', '2nd engineer officer',
  ],
  'third engineer': [
    '3rd engineer', '3e', '3/e', 'third engr', '3rd engr',
    '3rd engg', '3rd eng', 'third engineer officer',
  ],
  'fourth engineer': [
    '4th engineer', '4e', '4/e', 'fourth engr', '4th engr',
    '4th engg', '4th eng', 'fourth engineer officer',
  ],
  'fifth engineer': [
    '5th engineer', '5e', '5/e', 'fifth engr', '5th engr',
    'trainee marine engineer', 'tme', 'tme/fifth engineer',
    'engine cadet', 'junior engineer', 'junior fifth engineer',
  ],
  'electrical officer': [
    'eto', 'e.t.o.', 'electro technical officer', 'electro-technical officer',
    'electrical officer coc', 'electrical officer - coc',
    'electrical officer - without coc', 'electrical officer without coc',
    'elec officer', 'e/o',
  ],
  'electrical cadet': [
    'eto cadet', 'cadet (eto)', 'electro technical cadet',
    'electrical cadet trainee', 'junior eto',
  ],
  'bosun': [
    'boatswain', "bo'sun", "bos'n", 'bosun/ab', 'boat swain',
  ],
  'able seafarer deck': [
    'ab', 'a.b.', 'able seaman', 'able bodied seaman', 'able bodied',
    'a/b deck', 'deck ab', 'able seaman deck', 'a.b. deck', 'ab deck',
    'able seafarer (deck)',
  ],
  'ordinary seamen': [
    'ordinary seaman', 'os', 'o.s.', 'ord seaman', 'ord. seaman',
    'ordinary seaman deck',
  ],
  'motorman': [
    'oiler', 'motor man', 'able seafarer engine', 'a/b engine',
    'ab engine', 'able seaman engine', 'engine ab', 'oiler/motorman',
    'engine room ab', 'able seafarer (engine)',
  ],
  'wiper': [
    'engine wiper', 'engine room wiper', 'e/r wiper', 'er wiper',
  ],
  'fitter': [
    'deck fitter', 'engine fitter', 'motorman fitter',
    'fitter/welder', 'mechanical fitter', 'welder fitter',
  ],
  'gas engineer': [
    'gas eng', 'lng engineer', 'gas engineer officer',
  ],
  'cargo engineer': [
    'cargo eng', 'cargo engineer officer',
  ],
  'chief cook': [
    'cook', 'ship cook', 'head cook', 'cook/baker', '1st cook',
  ],
  'general steward': [
    'gs', 'assistant cook', 'asst cook', 'asst. cook',
    'steward', 'chief steward', 'messman', 'messboy',
    'messman/gs/asst. cook', 'general service',
  ],
  'pumpman': [
    'pump man', 'pump operator', 'p/m', 'pump-man',
  ],
  'trainee messman': [
    'trainee mess man', 'messman trainee', 'trainee mess',
  ],
  'riding crew': [
    'riding squad', 'riding gang',
  ],
  'junior fourth engineer': [
    'junior 4th engineer', 'jr 4e', 'jr. 4th engineer', 'j/4e',
    'jr fourth engineer',
  ],
  'junior third officer': [
    'junior 3rd officer', 'jr 3o', 'jr. 3rd officer', 'j/3o',
    'jr third officer',
  ],
  'cadet': [
    'trainee officer', 'officer cadet', 'marine cadet',
    'sea cadet', 'junior cadet',
  ],
};

// ── Core helpers ──────────────────────────────────────────────

/** Reduce a rank string to minimal comparable form */
export function normalizeRank(rank: string): string {
  return (rank || '').toLowerCase().replace(/[^a-z0-9/]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Resolve any rank variant → canonical name from MARITIME_RANKS.
 * Returns the original string if no match found.
 */
export function canonicalizeRank(rank: string): string {
  const n = normalizeRank(rank);

  for (const [canonKey, aliases] of Object.entries(RANK_ALIASES)) {
    if (n === canonKey || aliases.includes(n)) {
      return MARITIME_RANKS.find(r => normalizeRank(r) === canonKey) ?? rank;
    }
    // Partial containment (handles "Chief Officer Grade I", "3/O Navigating" etc.)
    if (n.includes(canonKey) || aliases.some(a => n.includes(a) || a.includes(n))) {
      return MARITIME_RANKS.find(r => normalizeRank(r) === canonKey) ?? rank;
    }
  }
  return rank;
}

/**
 * True when two rank strings refer to the same position (synonym-aware).
 */
export function ranksMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalizeRank(canonicalizeRank(a)) === normalizeRank(canonicalizeRank(b));
}

/**
 * True when a candidate's currentRank matches the search query.
 * Supports synonym resolution: typing "2e" matches "Second Engineer".
 */
export function rankMatchesQuery(currentRank: string, query: string): boolean {
  if (!currentRank || !query) return false;
  const nRank  = normalizeRank(currentRank);
  const nQuery = normalizeRank(query);
  if (nRank.includes(nQuery)) return true;
  const cRank  = normalizeRank(canonicalizeRank(currentRank));
  const cQuery = normalizeRank(canonicalizeRank(query));
  return cRank.includes(cQuery) || cQuery.includes(cRank);
}

// ── Filter UI groupings ───────────────────────────────────────
export interface RankGroup {
  label:       string;
  chipColor:   string;
  activeColor: string;
  ranks:       string[];
}

export const RANK_GROUPS: RankGroup[] = [
  {
    label:       'Deck Officers',
    chipColor:   'border-blue-200 text-blue-700 bg-white hover:bg-blue-50',
    activeColor: 'border-blue-500 bg-blue-500 text-white',
    ranks: [
      'Master', 'Chief Officer', 'Second Officer', 'Third Officer',
      'Junior Third Officer', 'Deck Cadet', 'Cadet',
    ],
  },
  {
    label:       'Engine Officers',
    chipColor:   'border-orange-200 text-orange-700 bg-white hover:bg-orange-50',
    activeColor: 'border-orange-500 bg-orange-500 text-white',
    ranks: [
      'Chief Engineer', 'Second Engineer', 'Third Engineer',
      'Fourth Engineer', 'Junior Fourth Engineer', 'Fifth Engineer',
    ],
  },
  {
    label:       'Electrical',
    chipColor:   'border-yellow-300 text-yellow-700 bg-white hover:bg-yellow-50',
    activeColor: 'border-yellow-500 bg-yellow-500 text-white',
    ranks: ['Electrical Officer', 'Electrical Cadet'],
  },
  {
    label:       'Deck Ratings',
    chipColor:   'border-cyan-200 text-cyan-700 bg-white hover:bg-cyan-50',
    activeColor: 'border-cyan-500 bg-cyan-500 text-white',
    ranks: ['Bosun', 'Able Seafarer Deck', 'Ordinary Seamen', 'Pumpman', 'Riding Crew'],
  },
  {
    label:       'Engine Ratings',
    chipColor:   'border-red-200 text-red-700 bg-white hover:bg-red-50',
    activeColor: 'border-red-500 bg-red-500 text-white',
    ranks: ['Motorman', 'Wiper', 'Fitter', 'Gas Engineer', 'Cargo Engineer'],
  },
  {
    label:       'Catering / General',
    chipColor:   'border-pink-200 text-pink-700 bg-white hover:bg-pink-50',
    activeColor: 'border-pink-500 bg-pink-500 text-white',
    ranks: ['Chief Cook', 'General Steward', 'Trainee Messman'],
  },
];
