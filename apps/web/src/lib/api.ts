/**
 * Cliente HTTP mínimo para chamar a API de orquestração.
 *
 * Toda grandeza numérica trafega como string decimal (Princípio V) — este
 * módulo não faz nenhuma conversão: devolve o JSON como veio.
 */

// Empty string → relative URLs → same-origin → Next.js proxies to API via rewrites.
// NEXT_PUBLIC_API_URL kept for external deployments where proxy isn't in place.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown };

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, ...rest } = options;
  const init: RequestInit = {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    },
    credentials: 'include',
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${path}`, init);

  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

// --- Auth --------------------------------------------------------------------

export type UserInfo = { id: string; email: string; name: string };

export async function signUp(body: {
  name: string;
  email: string;
  password: string;
}): Promise<{ user: UserInfo }> {
  return request('/api/v1/auth/sign-up', { method: 'POST', body });
}

export async function signIn(body: {
  email: string;
  password: string;
}): Promise<{ user: UserInfo }> {
  return request('/api/v1/auth/sign-in', { method: 'POST', body });
}

export async function signOut(): Promise<void> {
  await request('/api/v1/auth/sign-out', { method: 'POST' });
}

export async function getSession(): Promise<{ user: UserInfo | null }> {
  return request('/api/v1/auth/session');
}

// --- Cenários ----------------------------------------------------------------

export type ScenarioSummary = {
  id: string;
  name: string;
  phase: string;
  finalSayRole: string;
  teamClosed: boolean;
  published: boolean;
  createdAt: string;
};

export async function listScenarios(page?: {
  limit?: number;
  offset?: number;
}): Promise<{ data: ScenarioSummary[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (page?.limit) params.set('limit', String(page.limit));
  if (page?.offset) params.set('offset', String(page.offset));
  const qs = params.size > 0 ? `?${params}` : '';
  return request(`/api/v1/scenarios${qs}`);
}

export async function createScenario(body: {
  name: string;
  finalSayRole?: 'CREATOR' | 'APPROVER';
  forecastHorizonMonths?: number;
}): Promise<ScenarioSummary> {
  return request('/api/v1/scenarios', { method: 'POST', body });
}

export type ScenarioDetail = ScenarioSummary & {
  forecastHorizonMonths: number;
  availableActions: string[];
};

export async function getScenario(id: string): Promise<ScenarioDetail> {
  return request(`/api/v1/scenarios/${id}`);
}

// --- Membros -----------------------------------------------------------------

export type MemberRole = 'CREATOR' | 'APPROVER' | 'COLLABORATOR';

export type ScenarioMember = {
  id: string;
  scenarioId: string;
  invitedEmail: string;
  role: MemberRole;
  userId: string | null;
  collaborationDoneAt: string | null;
  createdAt: string;
};

export async function listMembers(scenarioId: string): Promise<{ data: ScenarioMember[] }> {
  return request(`/api/v1/scenarios/${scenarioId}/members`);
}

export async function inviteMember(
  scenarioId: string,
  body: { email: string; role: 'APPROVER' | 'COLLABORATOR' },
): Promise<ScenarioMember> {
  return request(`/api/v1/scenarios/${scenarioId}/members`, { method: 'POST', body });
}

export async function closeTeam(scenarioId: string): Promise<void> {
  await request(`/api/v1/scenarios/${scenarioId}/close-team`, { method: 'POST' });
}

// --- Aprovação ---------------------------------------------------------------

export async function submitApprovalDecision(
  scenarioId: string,
  body: { decision: 'APPROVE' | 'RETURN'; reason?: string | undefined },
): Promise<void> {
  await request(`/api/v1/scenarios/${scenarioId}/approval-decision`, { method: 'POST', body });
}

// --- Upload e ingestão -------------------------------------------------------

export type IngestionJobStatus = {
  id: string;
  kind: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  issueCount: number;
  issueCapReached: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  failureReason: string | null;
};

export type IngestionIssueItem = {
  id: string;
  lineNumber: number;
  column: string | null;
  code: string;
  detail: string;
};

export async function uploadDataset(
  scenarioId: string,
  file: File,
  declaredLabels: string[],
): Promise<{ jobId: string }> {
  const form = new FormData();
  form.append('kind', 'SALES_HISTORY');
  form.append('declaredLabels', declaredLabels.join(';'));
  form.append('file', file);
  const res = await fetch(`${BASE_URL}/api/v1/scenarios/${scenarioId}/uploads`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as { jobId: string };
}

export async function getIngestionJob(jobId: string): Promise<IngestionJobStatus> {
  return request(`/api/v1/ingestion-jobs/${jobId}`);
}

export async function listIngestionIssues(
  jobId: string,
  page?: { limit?: number; offset?: number },
): Promise<{ data: IngestionIssueItem[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (page?.limit) params.set('limit', String(page.limit));
  if (page?.offset) params.set('offset', String(page.offset));
  const qs = params.size > 0 ? `?${params}` : '';
  return request(`/api/v1/ingestion-jobs/${jobId}/issues${qs}`);
}

// --- Parametrização ----------------------------------------------------------

export type SegmentationLevel = { id: string; position: number; label: string };

export type ModelPackageInfo = {
  id: 'FAST' | 'STANDARD' | 'COMPLETE';
  label: string;
  models: string[];
  backtestWindows: number;
  tradeoff: string;
};

export type SeriesPreview = {
  seriesCount: number;
  estimatedDurationSeconds: number;
  magnitude: 'SECONDS' | 'MINUTES' | 'TENS_OF_MINUTES' | 'HOURS';
  modelsEvaluated: number;
  backtestWindows: number;
};

export type ParametersBody = {
  groupingLevelIds: string[];
  prorationMonths: number;
  accuracyMetric: 'WMAPE' | 'MAPE' | 'BIAS';
  modelPackage: 'FAST' | 'STANDARD' | 'COMPLETE';
  horizonMonths: number;
};

export async function getLevels(scenarioId: string): Promise<{ data: SegmentationLevel[] }> {
  return request(`/api/v1/scenarios/${scenarioId}/levels`);
}

export async function getModelPackages(): Promise<{ data: ModelPackageInfo[] }> {
  return request('/api/v1/model-packages');
}

export async function getSeriesPreview(
  scenarioId: string,
  levelIds: string[],
  pkg: 'FAST' | 'STANDARD' | 'COMPLETE',
): Promise<SeriesPreview> {
  const qs = new URLSearchParams({ levelIds: levelIds.join(','), package: pkg });
  return request(`/api/v1/scenarios/${scenarioId}/series-preview?${qs}`);
}

export async function saveParameters(
  scenarioId: string,
  body: ParametersBody,
): Promise<ParametersBody & { prorationRequired: boolean; zeroHeavyWarning: boolean }> {
  return request(`/api/v1/scenarios/${scenarioId}/parameters`, { method: 'PUT', body });
}

// --- Cálculo de previsão -----------------------------------------------------

export type ForecastJobStatus = {
  id: string;
  scenarioId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  horizonMonths: number;
  accuracyMetric: string;
  modelPackage: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  failureReason: string | null;
};

export type ForecastItemRow = {
  id: string;
  productCode: string;
  segments: string[];
  year: number;
  month: number;
  quantity: string;
  winnerModel: string;
  metricValue: string | null;
};

export async function triggerForecast(scenarioId: string): Promise<{ jobId: string }> {
  return request(`/api/v1/scenarios/${scenarioId}/forecast-jobs`, { method: 'POST' });
}

export async function getForecastJob(scenarioId: string, jobId: string): Promise<ForecastJobStatus> {
  return request(`/api/v1/scenarios/${scenarioId}/forecast-jobs/${jobId}`);
}

export async function listForecastItems(
  scenarioId: string,
  page?: { limit?: number; offset?: number },
): Promise<{ data: ForecastItemRow[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (page?.limit) params.set('limit', String(page.limit));
  if (page?.offset) params.set('offset', String(page.offset));
  const qs = params.size > 0 ? `?${params}` : '';
  return request(`/api/v1/scenarios/${scenarioId}/forecast-items${qs}`);
}

// --- Colaboração -------------------------------------------------------------

export type CollaborationAdjustment = {
  id: string;
  forecastItemId: string;
  authorId: string;
  quantity: string;
  reason: string;
  origin: 'UI' | 'SPREADSHEET';
  createdAt: string;
};

export type CollaborationItemRow = {
  id: string;
  productCode: string;
  segments: string[];
  year: number;
  month: number;
  calculatedQuantity: string;
  currentAdjustment: CollaborationAdjustment | null;
  version: number;
};

export async function listCollaborationItems(
  scenarioId: string,
  page?: { limit?: number; offset?: number },
): Promise<{ data: CollaborationItemRow[]; total: number; limit: number; offset: number }> {
  const params = new URLSearchParams();
  if (page?.limit) params.set('limit', String(page.limit));
  if (page?.offset) params.set('offset', String(page.offset));
  const qs = params.size > 0 ? `?${params}` : '';
  return request(`/api/v1/scenarios/${scenarioId}/collaboration/items${qs}`);
}

export async function submitAdjustment(
  scenarioId: string,
  body: {
    forecastItemId: string;
    quantity: string;
    reason: string;
    expectedVersion?: number;
  },
): Promise<CollaborationAdjustment> {
  return request(`/api/v1/scenarios/${scenarioId}/collaboration/adjustments`, {
    method: 'POST',
    body,
  });
}

export async function markCollaborationDone(scenarioId: string): Promise<void> {
  await request(`/api/v1/scenarios/${scenarioId}/collaboration/done`, { method: 'POST' });
}

export async function closeCollaboration(scenarioId: string): Promise<void> {
  await request(`/api/v1/scenarios/${scenarioId}/collaboration/close`, { method: 'POST' });
}

export type SheetInfo = { url: string; expiresAt: string };

export async function getCollaborationSheet(scenarioId: string): Promise<SheetInfo> {
  return request(`/api/v1/scenarios/${scenarioId}/collaboration/sheet`);
}

export async function uploadCollaborationSheet(
  scenarioId: string,
  file: File,
): Promise<{ jobId: string }> {
  const form = new FormData();
  form.append('kind', 'COLLABORATION_SHEET');
  form.append('declaredLabels', 'n/a');
  form.append('file', file);
  const res = await fetch(`${BASE_URL}/api/v1/scenarios/${scenarioId}/uploads`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const contentType = res.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as { jobId: string };
}
