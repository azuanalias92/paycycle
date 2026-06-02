import type { StoredSession, Commitment } from "./types";
import { sortCommitments, normalizeDemoCommitmentForCurrentMonth } from "./helpers";

const API_BASE_URL = "https://paycycle-api.traone.workers.dev";
const SESSION_STORAGE_KEY = "paycycle.session";
const DEMO_COMMITMENTS_STORAGE_KEY = "paycycle.demo.commitments";

function getErrorMessage(response: Response): Promise<string> {
  return response.text().then((text) => {
    try {
      const payload = JSON.parse(text);
      const message =
        payload?.error?.message ?? text.trim() ?? `Request failed with status ${response.status}.`;
      return message;
    } catch {
      return text.trim() || `Request failed with status ${response.status}.`;
    }
  });
}

export function getSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function setSession(session: StoredSession | null) {
  if (session) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

async function refreshSession(refreshToken: string): Promise<StoredSession> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  const payload = await response.json();
  const nextSession: StoredSession = {
    mode: "api",
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type,
    expiresIn: payload.expires_in,
    user: payload.user,
  };
  setSession(nextSession);
  return nextSession;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  requiresAuth = true
): Promise<T> {
  let activeSession = getSession();

  const makeRequest = async (accessToken?: string) => {
    const headers = new Headers(init.headers ?? {});
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (requiresAuth && accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  };

  if (requiresAuth && !activeSession?.accessToken) {
    throw new Error("Please sign in with Google first.");
  }

  let response = await makeRequest(activeSession?.accessToken);
  if (response.status === 401 && activeSession?.refreshToken) {
    activeSession = await refreshSession(activeSession.refreshToken);
    response = await makeRequest(activeSession.accessToken);
  }
  if (!response.ok) {
    const message = await getErrorMessage(response);
    if (response.status === 401) setSession(null);
    throw new Error(message);
  }
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export async function fetchCommitments(): Promise<Commitment[]> {
  const session = getSession();
  if (!session) return [];
  if (session.mode === "demo") {
    return loadDemoCommitments();
  }
  return apiRequest<Commitment[]>("/commitments", { method: "GET" });
}

export function loadDemoCommitments(): Commitment[] {
  try {
    const raw = localStorage.getItem(DEMO_COMMITMENTS_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Commitment[];
      return sortCommitments(data.map(normalizeDemoCommitmentForCurrentMonth));
    }
  } catch {}
  return sortCommitments(createInitialDemoCommitments().map(normalizeDemoCommitmentForCurrentMonth));
}

export function saveDemoCommitments(commitments: Commitment[]) {
  const sorted = sortCommitments(commitments);
  localStorage.setItem(DEMO_COMMITMENTS_STORAGE_KEY, JSON.stringify(sorted));
  return sorted;
}

function createDemoCommitment({
  id,
  title,
  amount,
  paid_amount,
  category,
  status,
}: {
  id: string;
  title: string;
  amount: number;
  paid_amount: number;
  category: string;
  status?: "pending" | "completed";
}): Commitment {
  const timestamp = new Date().toISOString();
  return {
    id,
    user_id: "demo-user",
    title,
    amount,
    paid_amount,
    due_date: getCurrentMonthStartIso(),
    status: status ?? (paid_amount >= amount ? "completed" : "pending"),
    category,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function createInitialDemoCommitments(): Commitment[] {
  return [
    createDemoCommitment({
      id: "demo-rent",
      title: "Monthly Rent",
      amount: 1450,
      paid_amount: 0,
      category: "Housing",
    }),
    createDemoCommitment({
      id: "demo-groceries",
      title: "Groceries Budget",
      amount: 450,
      paid_amount: 180,
      category: "Living",
    }),
    createDemoCommitment({
      id: "demo-netflix",
      title: "Netflix Subscription",
      amount: 55,
      paid_amount: 55,
      category: "Entertainment",
      status: "completed",
    }),
  ];
}

export function createDemoSession(): StoredSession {
  return {
    mode: "demo",
    accessToken: "",
    refreshToken: "",
    tokenType: "Demo",
    expiresIn: 0,
    user: {
      id: "demo-user",
      email: "demo@paycycle.local",
      name: "Demo User",
      avatar_url: null,
    },
  };
}

function getCurrentMonthStartIso(now = new Date()) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  ).toISOString();
}
