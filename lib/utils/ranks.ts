/**
 * Single source of truth for maritime ranks used across:
 * - AI extraction prompt (canonical names)
 * - Email processing (rank matching / synonym resolution)
 * - Candidate filters (multi-select, synonym search)
 */

// ── Canonical rank names (definitive list) ────────────────────
export const MARITIME_RANKS = [
  'Master',
  'Chief Officer',
  'Second Officer',
  'Third Officer',
  'Deck Cadet',
  'Chief Engineer',
  'Second Engineer',
  'Third Engineer',
  'Fourth Engineer',
  'TME/Fifth Engineer',
  'Electrical Officer - COC',
  'Electrical Officer - without COC',
  'Electrical Cadet',
  'Bosun',
  'AB Deck',
  'Ordinary Seamen',
  'Pumpman',
  'AB Engine',
  'Fitter',
  'Wiper',
  'Gas Engineer',
  'Chief Cook',
  'Messman/GS/Asst. Cook',
] as const;

export type CanonicalRank = typeof MARITIME_RANKS[number];

// ── Aliases: canonical (lower) → all known name variants (lower) ─
// Each key MUST match normalizeRank(canonical) exactly.
export const RANK_ALIASES: Record<string, string[]> = {
  'master': [
    'captain', 'master mariner', 'commanding officer', 'cmd', 'capt', 'm/m', 'capt.',
    'ship master', 'vessel master',
  ],
  'chief officer': [
    'c/o', 'chief mate', '1st officer', 'first officer', '1/o', 'chief off', 'c.o.',
    '1st off', 'chief officer mate',
  ],
  'second officer': [
    '2nd officer', '2/o', 'second mate', '2nd mate', '2nd off', 'navigating officer',
    '2nd ofcr', 'second off',
  ],
  'third officer': [
    '3rd officer', '3/o', 'third mate', '3rd mate', '3rd off', '3rd ofcr', 'third off',
  ],
  'deck cadet': [
    'navigating cadet', 'cadet (deck)', 'trainee deck officer', 'deck officer cadet',
    'cadet officer', 'junior officer deck', 'deck trainee',
  ],
  'chief engineer': [
    'c/e', '1st engineer', 'first engineer', 'chief engr', 'chief engg', '1/e', 'c.e.',
    '1st engr', 'chief engineer officer',
  ],
  'second engineer': [
    '2nd engineer', '2/e', 'second engr', '2nd engr', '2nd engg', '2nd eng',
    'second engineer officer', '2nd engineer officer',
  ],
  'third engineer': [
    '3rd engineer', '3/e', 'third engr', '3rd engr', '3rd engg', '3rd eng',
    'third engineer officer',
  ],
  'fourth engineer': [
    '4th engineer', '4/e', 'fourth engr', '4th engr', '4th engg', '4th eng',
    'fourth engineer officer',
  ],
  'tme/fifth engineer': [
    '5th engineer', 'fifth engineer', 'tme', 'junior engineer', '5/e', '5th engr',
    '5th engg', 'trainee marine engineer', 'tme/5th engineer',
  ],
  'electrical officer - coc': [
    'eto', 'electro technical officer', 'electro-technical officer', 'e.t.o.',
    'electrical officer coc', 'elec officer (coc)', 'electrical officer (coc)',
  ],
  'electrical officer - without coc': [
    'electrical officer', 'electrician', 'elec officer', 'e/o',
    'electrical officer (without coc)', 'electrical officer without coc',
  ],
  'electrical cadet': [
    'eto cadet', 'cadet (eto)', 'electrical cadet trainee', 'junior eto',
  ],
  'bosun': [
    'boatswain', "bo'sun", 'bosun/ab', "bos'n", 'boat swain',
  ],
  'ab deck': [
    'able seaman', 'ab', 'a.b.', 'able bodied seaman', 'able bodied', 'a/b deck',
    'deck ab', 'able seaman (deck)', 'able seaman deck', 'a.b. deck',
  ],
  'ordinary seamen': [
    'ordinary seaman', 'os', 'o.s.', 'ord seaman', 'ord. seaman', 'ordinary seaman deck',
  ],
  'pumpman': [
    'pump man', 'pump operator', 'p/m', 'pump-man',
  ],
  'ab engine': [
    'motorman', 'engine ab', 'oiler/motorman', 'engine room ab', 'a/b engine',
    'able seaman (engine)', 'able seaman engine', 'a.b. engine',
  ],
  'fitter': [
    'engine fitter', 'motorman fitter', 'fitter/welder', 'welder fitter',
    'mechanical fitter',
  ],
  'wiper': [
    'engine wiper', 'engine room wiper', 'oiler', 'e/r wiper', 'er wiper',
  ],
  'gas engineer': [
    'gas eng', 'lng engineer', 'gas engineer officer',
  ],
  'chief cook': [
    'cook', 'ship cook', 'head cook', 'cook/baker', '1st cook',
  ],
  'messman/gs/asst. cook': [
    'messman', 'gs', 'general steward', 'assistant cook', 'asst. cook', 'asst cook',
    'steward', 'messboy', 'general service', 'asst cook/gs',
  ],
};

// ── Helpers ───────────────────────────────────────────────────

/** Reduce a rank string to a minimal comparable form */
export function normalizeRank(rank: string): string {
  return (rank || '').toLowerCase().replace(/[^a-z0-9/]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Resolve any rank variant to its canonical name.
 * Falls back to the original string if not found.
 */
export function canonicalizeRank(rank: string): string {
  const n = normalizeRank(rank);

  for (const [canonKey, aliases] of Object.entries(RANK_ALIASES)) {
    // Exact canonical match
    if (n === canonKey) {
      return MARITIME_RANKS.find(r => normalizeRank(r) === canonKey) ?? rank;
    }
    // Exact alias match
    if (aliases.includes(n)) {
      return MARITIME_RANKS.find(r => normalizeRank(r) === canonKey) ?? rank;
    }
    // Partial containment (handles "Chief Officer Grade I" etc.)
    if (n.includes(canonKey) || aliases.some(a => n.includes(a) || a.includes(n))) {
      return MARITIME_RANKS.find(r => normalizeRank(r) === canonKey) ?? rank;
    }
  }
  return rank;
}

/**
 * Returns true when two rank strings refer to the same position.
 * Resolves synonyms before comparing.
 */
export function ranksMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ca = normalizeRank(canonicalizeRank(a));
  const cb = normalizeRank(canonicalizeRank(b));
  return ca === cb;
}

/**
 * Returns true when a candidate's current rank matches the query.
 * Supports synonym resolution: "2nd Engineer" matches "Second Engineer".
 */
export function rankMatchesQuery(currentRank: string, query: string): boolean {
  if (!currentRank || !query) return false;
  const nRank  = normalizeRank(currentRank);
  const nQuery = normalizeRank(query);
  if (nRank.includes(nQuery)) return true;             // direct substring
  // Canonicalize both sides and check again
  const cRank  = normalizeRank(canonicalizeRank(currentRank));
  const cQuery = normalizeRank(canonicalizeRank(query));
  return cRank.includes(cQuery) || cQuery.includes(cRank);
}

// ── Filter UI groupings ───────────────────────────────────────
export interface RankGroup {
  label: string;
  chipColor:    string;   // inactive chip style
  activeColor:  string;   // active/selected chip style
  ranks:        string[]; // canonical rank names in this group
}

export const RANK_GROUPS: RankGroup[] = [
  {
    label:       'Deck Officers',
    chipColor:   'border-blue-200 text-blue-700 bg-white hover:bg-blue-50',
    activeColor: 'border-blue-500 bg-blue-500 text-white',
    ranks:       ['Master', 'Chief Officer', 'Second Officer', 'Third Officer', 'Deck Cadet'],
  },
  {
    label:       'Engine Officers',
    chipColor:   'border-orange-200 text-orange-700 bg-white hover:bg-orange-50',
    activeColor: 'border-orange-500 bg-orange-500 text-white',
    ranks:       ['Chief Engineer', 'Second Engineer', 'Third Engineer', 'Fourth Engineer', 'TME/Fifth Engineer'],
  },
  {
    label:       'Electrical',
    chipColor:   'border-yellow-300 text-yellow-700 bg-white hover:bg-yellow-50',
    activeColor: 'border-yellow-500 bg-yellow-500 text-white',
    ranks:       ['Electrical Officer - COC', 'Electrical Officer - without COC', 'Electrical Cadet'],
  },
  {
    label:       'Deck Ratings',
    chipColor:   'border-cyan-200 text-cyan-700 bg-white hover:bg-cyan-50',
    activeColor: 'border-cyan-500 bg-cyan-500 text-white',
    ranks:       ['Bosun', 'AB Deck', 'Ordinary Seamen', 'Pumpman'],
  },
  {
    label:       'Engine Ratings',
    chipColor:   'border-red-200 text-red-700 bg-white hover:bg-red-50',
    activeColor: 'border-red-500 bg-red-500 text-white',
    ranks:       ['AB Engine', 'Fitter', 'Wiper', 'Gas Engineer'],
  },
  {
    label:       'Catering',
    chipColor:   'border-pink-200 text-pink-700 bg-white hover:bg-pink-50',
    activeColor: 'border-pink-500 bg-pink-500 text-white',
    ranks:       ['Chief Cook', 'Messman/GS/Asst. Cook'],
  },
];
