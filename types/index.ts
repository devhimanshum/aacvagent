// ============================================================
// Core domain types for CV Agent
// ============================================================

export type Decision = 'selected' | 'unselected';
export type ReviewStatus = 'pending' | 'selected' | 'unselected';

// ── Maritime rank configuration ──────────────────────────────
export interface RankRequirement {
  rank:    string;
  enabled: boolean;
  order:   number; // 1-based priority order (1 = highest)
  // legacy field kept for backward-compat reads; ignored going forward
  minDurationMonths?: number;
}

export interface RankConfig {
  requirements: RankRequirement[];
  updatedAt: string;
}

// ── Rank history extracted from CV ───────────────────────────
export interface RankEntry {
  rank:          string;
  vessel?:       string;   // vessel name (e.g. "MV Pacific Star")
  vesselType?:   string;   // ship type (e.g. "Bulk Carrier", "Oil Tanker")
  company?:      string;
  from?:         string;
  to?:           string;
  durationMonths?: number;
  isPresentRole?:  boolean;
}

// ── Maritime document (Passport / CDC / COC / COP) ───────────
export interface MaritimeDocument {
  number:       string;  // document / licence number
  issueDate:    string;  // "DD/MM/YYYY" or "Month YYYY" or empty
  expiryDate:   string;  // same, or "LIFE TIME" / "N/A"
  placeOfIssue: string;
}

export interface MaritimeDocuments {
  passport?: MaritimeDocument;
  cdc?:      MaritimeDocument;  // C.D.C. / Continuous Discharge Certificate
  coc?:      MaritimeDocument;  // Certificate of Competency
  cop?:      MaritimeDocument;  // Certificate of Proficiency
}

// ── AI extraction result (maritime) ─────────────────────────
export interface MaritimeAIResult {
  name:                  string;
  email:                 string;
  phones:                string[];   // up to 2 numbers
  currentRank:           string;
  rankHistory:           RankEntry[];
  totalSeaServiceMonths: number;
  education:             string;
  summary:               string;
  documents:             MaritimeDocuments;
}

// ── Legacy AI result (kept for backward compat) ──────────────
export interface CandidateAIResult {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  experience_years: number;
  education: string;
  score: number;
  decision: Decision;
  reason: string;
}

// ── Candidate stored in Firestore ────────────────────────────
export interface Candidate {
  id: string;
  // identity
  name:   string;
  email:  string;
  phones: string[];    // up to 2 numbers (replaces legacy `phone`)
  phone?: string;      // legacy field — kept for backward-compat reads only
  // maritime specifics
  currentRank: string;
  rankHistory: RankEntry[];
  totalSeaServiceMonths: number;
  summary: string;
  education: string;
  // CV attachment (fetched on-demand from Outlook — no storage needed)
  cvFileName: string;
  cvFileUrl: string;       // empty unless Firebase Storage is used
  cvAttachmentId: string;  // Outlook attachment ID for on-demand fetch
  // email source
  emailId: string;
  emailSubject: string;
  senderEmail: string;
  // maritime documents (Passport / CDC / COC / COP)
  documents?: MaritimeDocuments;
  // review workflow
  reviewStatus: ReviewStatus;
  reviewedAt?: string;
  reviewNote?: string;          // optional note left by reviewer
  // rank config matching (set during processing)
  rankMatched?: boolean;        // true = at least one configured rank found
  rankMatchScore?: number;      // 0-100, % of required ranks matched
  // meta
  duplicate: boolean;
  processedAt: string;
  createdAt: string;
}

export interface EmailAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string;
}

export interface OutlookEmail {
  id: string;
  subject: string;
  from: {
    emailAddress: { name: string; address: string };
  };
  toRecipients?: Array<{ emailAddress: { name: string; address: string } }>;
  receivedDateTime: string;
  hasAttachments: boolean;
  isRead: boolean;
  isDraft?: boolean;
  importance?: 'low' | 'normal' | 'high';
  bodyPreview?: string;
  body?: { content: string; contentType: 'html' | 'text' };
  attachments?: (EmailAttachment & { isCVFile?: boolean })[];
  // enriched on server
  processed?: boolean;
  processedRecord?: ProcessedEmail | null;
}

export interface ProcessedEmail {
  id: string;
  outlookId: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  receivedAt: string;
  processedAt: string;
  status: 'processed' | 'skipped' | 'error';
  errorMessage?: string;
  candidateId?: string;
  attachmentName?: string;
}

// Legacy — kept so settings page compiles
export interface JobConfig {
  id?: string;
  jobRole: string;
  requiredSkills: string[];
  minimumExperience: number;
  educationRequirement: string;
  customKeywords: string[];
  scoreThreshold: number;
  additionalNotes: string;
  updatedAt: string;
}

export interface OutlookSettings {
  clientId: string;
  tenantId: string;
  clientSecret: string;
  inboxEmail: string;
  connected: boolean;
  lastSync?: string;
}

export interface GeminiSettings {
  apiKey: string;
  model: string;
  configured: boolean;
}

export interface AppSettings {
  outlook: OutlookSettings;
  gemini: GeminiSettings;
}

export interface DashboardStats {
  total: number;
  selected: number;
  unselected: number;
  pending: number;
  duplicates: number;
  pendingEmails: number;
  processedEmails: number;
}

// ── Token usage tracking ──────────────────────────────────────
export interface TokenUsageRecord {
  id?: string;
  date: string;               // YYYY-MM-DD
  candidateName: string;
  emailSubject: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  costUsd: number;
  processedAt: string;
}

export interface DailyUsageSummary {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requests: number;
  costUsd: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ProcessEmailResult {
  emailId: string;
  status: 'success' | 'skipped' | 'error';
  candidateId?: string;
  message: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyCv {
  id: string;
  name: string;
  nationality: string;
  rank: string;
  email: string;        // cleaned (no trailing spaces, no _x000D_ junk)
  phones: string[];     // M1/M2/M3 cleaned — null and [GPT ERROR] values removed
  importedAt: string;   // ISO date string
  createdAt: string;
  // Server-side filter index fields (lowercase for equality queries)
  rankLower?: string;
  nationalityLower?: string;
  nameLower?: string;
}
