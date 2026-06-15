export type UserRole = 'super_admin' | 'admin' | 'agent';

export interface Publisher {
  _id: string; name: string; slug: string; apiKey: string;
  isActive: boolean; contactEmail: string; contactPhone?: string;
  ipWhitelist: string[]; notes?: string; createdAt: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  _id: string; name: string; email: string; role: UserRole;
  publisher?: Publisher; isActive: boolean; lastLogin?: string; createdAt: string;
  approvalStatus?: ApprovalStatus; approvedAt?: string;
}

// 'conditional' removed — it's not a field type, it was causing blank inputs.
// Conditional behaviour is set via conditionalRules on any regular field.
export type FieldType =
  | 'text' | 'email' | 'phone' | 'number'
  | 'select' | 'radio' | 'checkbox'
  | 'textarea' | 'date'
  | 'hidden' | 'api_autofill'
  | 'token_jornaya' | 'token_trustedform'
  | 'static_value';

export interface FieldOption { label: string; value: string; }

export interface ConditionalRule {
  sourceFieldKey?: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';
  value?: string;
  action: 'show' | 'hide' | 'require';
  targetFieldKey: string;
}

export interface Field {
  _id: string; label: string; key: string; type: FieldType;
  placeholder?: string; defaultValue?: unknown; staticValue?: string;
  options?: FieldOption[];
  validation?: { minLength?: number; maxLength?: number; pattern?: string; min?: number; max?: number; };
  conditionalRules?: ConditionalRule[];
  description?: string; ringbaParamKey?: string; createdAt: string;
}

// Per-destination param key override set per field per campaign
export interface DestinationParams {
  ringba?: string;    // param name for Ringba Regular
  rtb?: string;       // param name for Ringba RTB
  callgrid?: string;  // param name for CallGrid
}

export interface CampaignField {
  field: Field;
  isRequired: boolean;
  order: number;
  overrideLabel?: string;
  overridePlaceholder?: string;
  overrideDefaultValue?: unknown;
  includeInRingba: boolean;
  destinationParams: DestinationParams; // per-destination param key overrides
  conditionalRules: ConditionalRule[];
}

export type CampaignDestination =
  | 'ringba_regular' | 'ringba_rtb' | 'callgrid'
  | 'ringba_regular_and_callgrid' | 'ringba_rtb_and_callgrid';

export interface Campaign {
  _id: string; name: string; publisher: Publisher | null;
  destination: CampaignDestination;
  ringbaId?: string;
  ringbaRtbUrl?: string;
  callgridUrl?: string;
  isActive: boolean;
  jornayaEnabled: boolean; trustedFormEnabled: boolean; apiAutofillEnabled: boolean;
  fields: CampaignField[]; enrichUrl?: string;
  description?: string; tags: string[]; createdAt: string;
}

export interface SubmissionValidation {
  enabled: boolean; valid?: boolean;
  transId?: string; certId?: string; message?: string; reason?: string;
}

// Exact request a destination sent (super-admin enrichment mapping view)
export interface DestinationRequest {
  provider?: string;
  url?: string;
  uniqueKey?: string;
  params?: Record<string, unknown>;
  fullUrl?: string;
}

export interface DestinationResult {
  sent: boolean;
  sentAt?: string;
  provider?: string;
  error?: string;
  request?: DestinationRequest;
  response?: unknown;
}

export interface Submission {
  _id: string; publisher: Publisher | null; campaign: Campaign | null;
  agent?: User; source: 'form' | 'api' | 'repost'; repostOf?: string;
  data: Record<string, unknown>; phone?: string; phoneNormalized?: string;
  age?: number; providerUsed?: string; attemptCount?: number; callBeforeLead?: boolean;
  jornaya: SubmissionValidation; trustedForm: SubmissionValidation;
  ringba: { sent: boolean; sentAt?: string; error?: string; response?: unknown };
  destinationResults?: Record<string, DestinationResult>;
  apiAutofill: { used: boolean; source?: string };
  isDuplicate: boolean; status: 'pending' | 'valid' | 'invalid' | 'sent' | 'failed';
  ipAddress?: string; createdAt: string;
}

export type CallStatus = 'valid' | 'call_before_lead' | 'unmatched';

export interface Call {
  _id: string;
  publisher: Publisher | null;
  publisherName?: string;
  campaign?: Campaign | null;
  callerId?: string;
  callerIdNormalized?: string;
  callTimeStamp?: string;
  matchedLead?: { _id: string; phone?: string; createdAt?: string } | null;
  status: CallStatus;
  isFraud: boolean;
  raw?: Record<string, unknown>;
  createdAt: string;
}

export interface CallStats {
  totalCalls: number;
  invalidCalls: number;
  validCalls: number;
  fraudRate: number;
  byStatus: { _id: string; count: number }[];
  perPublisher: { _id: string; publisherName: string; total: number; invalid: number; fraudRate: number }[];
}

export interface SubmissionStats {
  totals: number;
  validLeads: number;
  invalidLeads: number;
  bySource: { _id: string; count: number }[];
  byStatus: { _id: string; count: number }[];
  byCampaign: { campaignName: string; count: number }[];
  perPublisher: { _id: string; publisherName: string; total: number; invalid: number; valid: number }[];
}

export interface PaginatedResponse<T> {
  status: string; data: T[];
  meta: { total: number; page: number; limit: number; pages: number };
}
export interface ApiResponse<T> { status: string; data: T; }
export interface AuthTokens { accessToken: string; refreshToken: string; user: User; }
