/**
 * Cliente HTTP mínimo para chamar a API de orquestração.
 *
 * Toda grandeza numérica trafega como string decimal (Princípio V) — este
 * módulo não faz nenhuma conversão: devolve o JSON como veio.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

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

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message ?? `HTTP ${res.status}`;
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
