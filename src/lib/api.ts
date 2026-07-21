/**
 * REST client for the CeMIS Spring Boot backend.
 *
 * The backend serializes entities with a snake_case Jackson naming strategy
 * (to match the original database column names), so response/request bodies
 * use snake_case fields throughout — components keep their own local
 * snake_case types and call apiGet/apiPost/etc directly.
 */

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8080/api") as string;

// ── Token storage ─────────────────────────────────────────────────────────────

const TOKEN_KEY = "cemis_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Generic REST helpers ────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  isFormData?: boolean,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `${method} ${path} → ${res.status}`;
    try {
      const err = await res.json();
      message = err.message ?? err.error ?? message;
    } catch {
      // ignore — keep default message
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") return undefined as T;
  return res.json();
}

export const apiGet = <T = unknown>(path: string) => request<T>("GET", path);
export const apiPost = <T = unknown>(path: string, body?: unknown) => request<T>("POST", path, body);
export const apiPut = <T = unknown>(path: string, body?: unknown) => request<T>("PUT", path, body);
export const apiPatch = <T = unknown>(path: string, body?: unknown) => request<T>("PATCH", path, body);
export const apiDelete = <T = unknown>(path: string) => request<T>("DELETE", path);
export const apiUpload = <T = unknown>(path: string, form: FormData, method: "POST" | "PUT" = "POST") =>
  request<T>(method, path, form, true);

// ── Auth ──────────────────────────────────────────────────────────────────────

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "user";
  mustChangePassword: boolean;
};

export const auth = {
  login: async (email: string, password: string) => {
    const res = await apiPost<{ token: string } & AuthUser>("/auth/login", { email, password });
    setToken(res.token);
    return res;
  },
  logout: () => {
    clearToken();
  },
  me: () => apiGet<AuthUser>("/auth/me"),
  changePassword: (newPassword: string) =>
    apiPost<{ ok: boolean }>("/auth/change-password", { newPassword }),
};
