import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequest } from "@tanstack/react-start/server";

const API_URL =
  (typeof process !== 'undefined' ? process.env?.VITE_API_URL : undefined) ??
  'http://localhost:8080/api';

function getAuthHeader(): string | null {
  try {
    const req = getRequest();
    return (req?.headers as any)?.get?.('authorization') ?? null;
  } catch {
    return null;
  }
}

async function backendFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const authHeader = getAuthHeader();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...((opts.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Backend error ${res.status}: ${text}`);
  }
  return res.json();
}

export const listUsers = createServerFn({ method: "GET" }).handler(async () => {
  const users: any[] = await backendFetch('/users');
  return users.map((u) => ({
    id: u.id,
    email: u.email ?? '',
    full_name: u.full_name ?? u.fullName ?? null,
    phone: u.phone ?? null,
    created_at: u.created_at ?? u.createdAt ?? null,
    last_sign_in_at: null,
    role: u.role ?? null,
    active: u.active ?? true,
  }));
});

export const createUser = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(["admin", "user"]),
      full_name: z.string().min(1).max(120),
      phone: z.string().max(40).optional(),
    })
  )
  .handler(async ({ data }) => {
    const { email, password, role, full_name } = data;
    const user = await backendFetch('/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName: full_name, role }),
    });
    return { id: user.id, email: user.email ?? email };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data }) => {
    await backendFetch(`/users/${data.userId}`, { method: 'DELETE' });
    return { ok: true };
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string().uuid(), role: z.enum(["admin", "user"]) }))
  .handler(async ({ data }) => {
    await backendFetch(`/users/${data.userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role: data.role }),
    });
    return { ok: true };
  });
