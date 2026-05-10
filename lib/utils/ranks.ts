/**
 * Maritime rank definitions — single source of truth.
 *
 * Each entry is the canonical (display) name followed by every known
 * alias for that same rank.  If a CV or search query contains ANY of
 * those strings, it is treated as the same rank.
 *
 * Example: "Fourth Engineer", "4th Engineer", "4E", "4/E" → same rank.
 */

// ── Canonical names (display order) ──────────────────────────
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

/**
 * Aliases for each rank (canonical name → all known variants, lowercase).
 * Keys must match normalizeRank(canonical) exactly.
 */
export const RANK_ALIASES: Record<string, string[]> = {
  'master':                  ['captain', 'capt', 'capt.', 'master mariner', 'm/m', 'commanding officer'],
  'chief officer':           ['c/o', 'co', 'chief mate', '1st officer', 'first officer', '1/o'],
  'second officer':          ['2nd officer', '2/o', '2o', 'second mate', '2nd mate'],
  'third officer':           ['3rd officer', '3/o', '3o', 'third mate', '3rd mate'],
  'deck cadet':              ['navigating cadet', 'cadet deck', 'deck officer cadet', 'trainee deck officer'],
  'chief engineer':          ['c/e', 'ce', 'chief engr', '1st engineer', 'first engineer', '1/e'],
  'second engineer':         ['2nd engineer', '2/e', '2e', 'second engr', '2nd engr'],
  'third engineer':          ['3rd engineer', '3/e', '3e', 'third engr', '3rd engr'],
  'fourth engineer':         ['4th engineer', '4/e', '4e', 'fourth engr', '4th engr'],
  'fifth engineer':          ['5th engineer', '5/e', '5e', 'tme', 'trainee marine engineer', 'engine cadet', 'junior engineer'],
  'electrical officer':      ['eto', 'electro technical officer', 'electro-technical officer', 'electrical officer coc', 'electrical officer - coc', 'electrical officer - without coc', 'elec officer', 'e/o'],
  'electrical cadet':        ['eto cadet', 'electro technical cadet', 'cadet eto'],
  'bosun':                   ['boatswain', "bo'sun", 'bosun/ab'],
  'able seafarer deck':      ['ab', 'a.b.', 'able seaman', 'able bodied seaman', 'ab deck', 'a/b deck', 'able seaman deck'],
  'ordinary seamen':         ['ordinary seaman', 'os', 'o.s.', 'ord seaman'],
  'motorman':                ['oiler', 'able seafarer engine', 'ab engine', 'a/b engine', 'oiler/motorman'],
  'wiper':                   ['engine wiper', 'engine room wiper', 'er wiper'],
  'fitter':                  ['deck fitter', 'engine fitter', 'fitter/welder'],
  'gas engineer':            ['gas eng', 'lng engineer'],
  'cargo engineer':          ['cargo eng'],
  'chief cook':              ['cook', 'ship cook', 'head cook'],
  'general steward':         ['gs', 'assistant cook', 'asst cook', 'asst. cook', 'steward', 'messman', 'messboy', 'messman/gs/asst. cook'],
  'pumpman':                 ['pump man', 'pump operator', 'p/m'],
  'trainee messman':         ['messman trainee', 'trainee mess man'],
  'riding crew':             ['riding squad', 'riding gang'],
  'junior fourth engineer':  ['junior 4th engineer', 'jr 4e', 'jr. 4th engineer', 'j/4e'],
  'junior third officer':    ['junior 3rd officer', 'jr 3o', 'jr. 3rd officer', 'j/3o'],
  'cadet':                   ['officer cadet', 'marine cadet', 'trainee officer'],
};

// ── Core helpers ──────────────────────────────────────────────

export function normalizeRank(rank: string): string {
  return (rank || '').toLowerCase().replace(/[^a-z0-9/]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function canonicalizeRank(rank: string): string {
  const n = normalizeRank(rank);
  for (const [key, aliases] of Object.entries(RANK_ALIASES)) {
    if (n === key || aliases.includes(n)) {
      return MARITIME_RANKS.find(r => normalizeRank(r) === key) ?? rank;
    }
    if (n.includes(key) || aliases.some(a => n.includes(a) || a.includes(n))) {
      return MARITIME_RANKS.find(r => normalizeRank(r) === key) ?? rank;
    }
  }
  return rank;
}

/** True when two rank strings refer to the same rank (alias-aware). */
export function ranksMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalizeRank(canonicalizeRank(a)) === normalizeRank(canonicalizeRank(b));
}

/** True when a candidate's primaryRank matches the search query (alias-aware). */
export function rankMatchesQuery(primaryRank: string, query: string): boolean {
  if (!primaryRank || !query) return false;
  const nRank  = normalizeRank(primaryRank);
  const nQuery = normalizeRank(query);
  if (nRank.includes(nQuery)) return true;
  const cRank  = normalizeRank(canonicalizeRank(primaryRank));
  const cQuery = normalizeRank(canonicalizeRank(query));
  return cRank.includes(cQuery) || cQuery.includes(cRank);
}
