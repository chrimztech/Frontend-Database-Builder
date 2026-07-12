// Spring Boot backend adapter — replaces the Supabase client.
// Exposes the same supabase.from(table).select/insert/update/delete chain.
// Import exactly as before: import { supabase } from "@/integrations/supabase/client";

const BASE_URL: string =
  (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_API_URL : undefined) ??
  (typeof process !== 'undefined' ? process.env?.VITE_API_URL : undefined) ??
  'http://localhost:8080/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('cemis_token');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...((opts.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${opts.method ?? 'GET'} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
  return res.text();
}

// ─── Enrolment row normalisation ─────────────────────────────────────────────
// Backend returns { student: {...}, course: {...}, certificate: {...} }.
// Frontend expects { students: {...}, courses: {...}, student_id, course_id, certificate_id }.

function normalizeEnrolmentRow(row: any): any {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    student_id: row.student_id ?? row.student?.id ?? null,
    course_id: row.course_id ?? row.course?.id ?? null,
    certificate_id: row.certificate_id ?? row.certificate?.id ?? null,
    students: row.students ?? row.student ?? null,
    courses: row.courses ?? row.course ?? null,
  };
}

function normalizeEnrolments(data: any): any {
  if (Array.isArray(data)) return data.map(normalizeEnrolmentRow);
  return normalizeEnrolmentRow(data);
}

// ─── JWT helpers ─────────────────────────────────────────────────────────────

function decodeJwt(token: string): any {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

// ─── Query Builder ────────────────────────────────────────────────────────────

type FilterOp = 'eq' | 'neq' | 'in' | 'is';
interface Filter { col: string; op: FilterOp; val: any }

class QueryBuilder {
  private _filters: Filter[] = [];
  private _order: { col: string; asc: boolean } | null = null;
  private _limit: number | null = null;
  private _single = false;
  private _maybeSingle = false;
  private _method: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private _body: any = null;
  private _countExact = false;
  private _headOnly = false;

  constructor(private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    // When chained after insert/update/delete, select() is a RETURNING qualifier —
    // don't override the DML method. _method defaults to 'select' so standalone
    // .from(t).select(...) still works correctly.
    if (opts?.count === 'exact') this._countExact = true;
    if (opts?.head) this._headOnly = true;
    return this;
  }

  insert(data: any) { this._method = 'insert'; this._body = data; return this; }
  upsert(data: any, _opts?: any) { this._method = 'upsert'; this._body = data; return this; }
  update(data: any) { this._method = 'update'; this._body = data; return this; }
  delete() { this._method = 'delete'; return this; }

  eq(col: string, val: any) { this._filters.push({ col, op: 'eq', val }); return this; }
  neq(col: string, val: any) { this._filters.push({ col, op: 'neq', val }); return this; }
  in(col: string, vals: any[]) { this._filters.push({ col, op: 'in', val: vals }); return this; }
  is(col: string, val: any) { this._filters.push({ col, op: 'is', val }); return this; }

  order(col: string, opts?: { ascending?: boolean }) {
    this._order = { col, asc: opts?.ascending !== false };
    return this;
  }

  limit(n: number) { this._limit = n; return this; }
  single() { this._single = true; return this; }
  maybeSingle() { this._maybeSingle = true; return this; }

  // Thenable interface — allows `await supabase.from(...).select(...)`
  then<T = any>(resolve: (result: any) => T, reject?: (err: any) => any): Promise<T> {
    return this._execute().then(resolve, reject);
  }
  catch(fn: (err: any) => any) { return this._execute().catch(fn); }
  finally(fn: () => void) { return this._execute().finally(fn); }

  private async _execute(): Promise<{ data: any; error: any; count?: number }> {
    try {
      return await this._dispatch();
    } catch (err: any) {
      console.error('[cemis-adapter]', err?.message ?? err);
      return { data: null, error: { message: err?.message ?? String(err) } };
    }
  }

  private async _dispatch(): Promise<{ data: any; error: null; count?: number }> {
    const t = this.table;
    const isSingle = this._single || this._maybeSingle;

    // ── org_settings ──────────────────────────────────────────────────────────
    if (t === 'org_settings') {
      if (this._method === 'select') {
        const row = await apiFetch('/settings');
        // Return array for list queries; single object for .maybeSingle()/.single()
        const data = isSingle ? row : (row ? [row] : []);
        return { data, error: null };
      }
      if (this._method === 'update') {
        const data = await apiFetch('/settings', {
          method: 'PUT',
          body: JSON.stringify(this._body),
        });
        return { data, error: null };
      }
    }

    // ── student_access_log ────────────────────────────────────────────────────
    if (t === 'student_access_log') {
      if (this._method === 'insert') {
        const payload = Array.isArray(this._body) ? this._body[0] : this._body;
        apiFetch('/reports/audit-log', {
          method: 'POST',
          body: JSON.stringify(payload),
        }).catch(() => {}); // fire-and-forget
        return { data: [payload], error: null };
      }
      if (this._method === 'select') {
        const size = this._limit ?? 500;
        const data = await apiFetch(`/reports/audit-log?size=${size}`);
        return { data, error: null };
      }
    }

    // ── enrolments ────────────────────────────────────────────────────────────
    if (t === 'enrolments') {
      if (this._method === 'select') {
        const idEq = this._filters.find((f) => f.col === 'id' && f.op === 'eq');
        if (idEq && isSingle) {
          const raw = await apiFetch(`/enrolments/${idEq.val}`);
          return { data: normalizeEnrolmentRow(raw), error: null };
        }
        const studentFilter = this._filters.find((f) => f.col === 'student_id' && f.op === 'eq');
        const courseFilter  = this._filters.find((f) => f.col === 'course_id'  && f.op === 'eq');
        // Combined student+course lookup used by CSV import duplicate-enrolment check
        if (studentFilter && courseFilter && isSingle) {
          const raw  = await apiFetch(`/enrolments?studentId=${studentFilter.val}`);
          const list = normalizeEnrolments(raw);
          const match = Array.isArray(list)
            ? (list.find((e: any) => e.course_id === courseFilter.val) ?? null)
            : null;
          return { data: match, error: null };
        }
        if (studentFilter) {
          const raw = await apiFetch(`/enrolments?studentId=${studentFilter.val}`);
          return { data: normalizeEnrolments(raw), error: null };
        }
        const statusIn = this._filters.find((f) => f.col === 'status' && f.op === 'in');
        const certNull = this._filters.find((f) => f.col === 'certificate_id' && f.op === 'is' && f.val === null);
        if (statusIn && certNull) {
          const qs = (statusIn.val as string[]).map((s) => `statusIn=${s}`).join('&');
          const raw = await apiFetch(`/enrolments?${qs}&noCertificate=true`);
          return { data: normalizeEnrolments(raw), error: null };
        }
        const raw = await apiFetch('/enrolments');
        const normalised = normalizeEnrolments(raw);
        if (this._countExact) {
          return { data: this._headOnly ? null : normalised, error: null, count: Array.isArray(normalised) ? normalised.length : 0 };
        }
        return { data: normalised, error: null };
      }

      if (this._method === 'update') {
        // Bulk: .update({status}).in("id", [...])
        const idsIn = this._filters.find((f) => f.col === 'id' && f.op === 'in');
        if (idsIn) {
          await apiFetch('/enrolments/bulk-start', {
            method: 'POST',
            body: JSON.stringify({ ids: idsIn.val }),
          });
          return { data: [], error: null };
        }
        // Single: .update({...}).eq("id", eid)
        const idEq = this._filters.find((f) => f.col === 'id' && f.op === 'eq');
        if (idEq) {
          const data = this._body as Record<string, any>;
          if ('payment_status' in data) {
            const raw = await apiFetch(`/enrolments/${idEq.val}/payment`, {
              method: 'PATCH',
              body: JSON.stringify(data),
            });
            return { data: normalizeEnrolmentRow(raw), error: null };
          }
          if ('status' in data) {
            const raw = await apiFetch(`/enrolments/${idEq.val}/status`, {
              method: 'PATCH',
              body: JSON.stringify(data),
            });
            return { data: normalizeEnrolmentRow(raw), error: null };
          }
          // Generic patch
          const raw = await apiFetch(`/enrolments/${idEq.val}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
          });
          return { data: normalizeEnrolmentRow(raw), error: null };
        }
      }

      if (this._method === 'insert') {
        const payload = Array.isArray(this._body) ? this._body[0] : this._body;
        const raw = await apiFetch('/enrolments', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        return { data: isSingle ? normalizeEnrolmentRow(raw) : [normalizeEnrolmentRow(raw)], error: null };
      }

      if (this._method === 'delete') {
        const idEq = this._filters.find((f) => f.col === 'id' && f.op === 'eq');
        if (idEq) {
          await apiFetch(`/enrolments/${idEq.val}`, { method: 'DELETE' });
          return { data: [], error: null };
        }
      }
    }

    // ── certificates ──────────────────────────────────────────────────────────
    if (t === 'certificates') {
      if (this._method === 'select') {
        const idEq = this._filters.find((f) => f.col === 'id' && f.op === 'eq');
        if (idEq && isSingle) {
          const data = await apiFetch(`/certificates/${idEq.val}`);
          return { data, error: null };
        }
        const codeEq = this._filters.find((f) => f.col === 'certificate_code' && f.op === 'eq');
        if (codeEq && isSingle) {
          const res = await apiFetch(`/certificates/verify/${encodeURIComponent(codeEq.val)}`);
          return { data: res?.certificate ?? null, error: null };
        }
        const certIdEq = this._filters.find((f) => f.col === 'certificate_id' && f.op === 'eq');
        if (certIdEq && isSingle) {
          const res = await apiFetch(`/certificates/verify/${encodeURIComponent(certIdEq.val)}`);
          return { data: res?.certificate ?? null, error: null };
        }
        const all = await apiFetch('/certificates');
        if (this._countExact) {
          return { data: this._headOnly ? null : all, error: null, count: Array.isArray(all) ? all.length : 0 };
        }
        return { data: all, error: null };
      }

      if (this._method === 'update') {
        const idEq = this._filters.find((f) => f.col === 'id' && f.op === 'eq');
        if (idEq) {
          const data = await apiFetch(`/certificates/${idEq.val}`, {
            method: 'PATCH',
            body: JSON.stringify(this._body),
          });
          return { data, error: null };
        }
        const idsIn = this._filters.find((f) => f.col === 'id' && f.op === 'in');
        if (idsIn) {
          await Promise.all(
            (idsIn.val as string[]).map((id) =>
              apiFetch(`/certificates/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(this._body),
              })
            )
          );
          return { data: [], error: null };
        }
      }

      if (this._method === 'delete') {
        const idEq = this._filters.find((f) => f.col === 'id' && f.op === 'eq');
        if (idEq) {
          await apiFetch(`/certificates/${idEq.val}`, { method: 'DELETE' });
          return { data: [], error: null };
        }
      }
    }

    // ── students ──────────────────────────────────────────────────────────────
    if (t === 'students') {
      if (this._method === 'select') {
        const idEq = this._filters.find((f) => f.col === 'id' && f.op === 'eq');
        if (idEq && isSingle) {
          const data = await apiFetch(`/students/${idEq.val}`);
          return { data, error: null };
        }
        const natIdEq = this._filters.find((f) => f.col === 'national_id' && f.op === 'eq');
        if (natIdEq && isSingle) {
          const data = await apiFetch(`/students?nationalId=${encodeURIComponent(natIdEq.val)}`);
          return { data: data ?? null, error: null };
        }
        const data = await apiFetch('/students');
        if (this._countExact) {
          return { data: this._headOnly ? null : data, error: null, count: Array.isArray(data) ? data.length : 0 };
        }
        return { data, error: null };
      }
      if (this._method === 'insert') {
        const payload = Array.isArray(this._body) ? this._body[0] : this._body;
        const data = await apiFetch('/students', { method: 'POST', body: JSON.stringify(payload) });
        return { data: isSingle ? data : [data], error: null };
      }
      if (this._method === 'update') {
        const idEq = this._filters.find((f) => f.col === 'id' && f.op === 'eq');
        if (idEq) {
          const data = await apiFetch(`/students/${idEq.val}`, {
            method: 'PUT',
            body: JSON.stringify(this._body),
          });
          return { data: [data], error: null };
        }
      }
      if (this._method === 'delete') {
        const idEq = this._filters.find((f) => f.col === 'id' && f.op === 'eq');
        if (idEq) {
          await apiFetch(`/students/${idEq.val}`, { method: 'DELETE' });
          return { data: [], error: null };
        }
      }
    }

    // ── courses ───────────────────────────────────────────────────────────────
    if (t === 'courses') {
      if (this._method === 'select') {
        const idEq = this._filters.find((f) => f.col === 'id' && f.op === 'eq');
        if (idEq && isSingle) {
          const data = await apiFetch(`/courses/${idEq.val}`);
          return { data, error: null };
        }
        const data = await apiFetch('/courses');
        if (this._countExact) {
          return { data: this._headOnly ? null : data, error: null, count: Array.isArray(data) ? data.length : 0 };
        }
        return { data, error: null };
      }
      if (this._method === 'insert') {
        const payload = Array.isArray(this._body) ? this._body[0] : this._body;
        const data = await apiFetch('/courses', { method: 'POST', body: JSON.stringify(payload) });
        return { data: isSingle ? data : [data], error: null };
      }
      if (this._method === 'update') {
        const idEq = this._filters.find((f) => f.col === 'id' && f.op === 'eq');
        if (idEq) {
          const data = await apiFetch(`/courses/${idEq.val}`, {
            method: 'PUT',
            body: JSON.stringify(this._body),
          });
          return { data: [data], error: null };
        }
      }
      if (this._method === 'delete') {
        const idEq = this._filters.find((f) => f.col === 'id' && f.op === 'eq');
        if (idEq) {
          await apiFetch(`/courses/${idEq.val}`, { method: 'DELETE' });
          return { data: [], error: null };
        }
      }
    }

    // ── user_roles — virtual table, roles live on the User entity ────────────
    if (t === 'user_roles') {
      if (this._method === 'select') {
        const users = await apiFetch('/users');
        const roles = (Array.isArray(users) ? users : []).map((u: any) => ({
          user_id: u.id,
          role: u.role,
        }));
        return { data: roles, error: null };
      }
      if (this._method === 'insert' || this._method === 'upsert') {
        const payload = Array.isArray(this._body) ? this._body[0] : this._body;
        await apiFetch(`/users/${payload.user_id}`, {
          method: 'PUT',
          body: JSON.stringify({ role: payload.role }),
        });
        return { data: [payload], error: null };
      }
    }

    // ── user_settings — virtual table stub ───────────────────────────────────
    if (t === 'user_settings') {
      return { data: [], error: null };
    }

    console.warn('[cemis-adapter] unhandled:', t, this._method);
    return { data: null, error: null };
  }
}

// ─── Storage adapter ─────────────────────────────────────────────────────────

function storageFrom(_bucket: string) {
  return {
    async download(path: string) {
      try {
        const token = getToken();
        const res = await fetch(`${BASE_URL}/branding/${encodeURIComponent(path)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return { data: null, error: { message: `${res.status}` } };
        return { data: await res.blob(), error: null };
      } catch (err: any) {
        return { data: null, error: { message: err.message } };
      }
    },

    async list() {
      try {
        const data = await apiFetch('/branding');
        return { data: data ?? [], error: null };
      } catch (err: any) {
        return { data: null, error: { message: err.message } };
      }
    },

    async upload(path: string, file: File | Blob, _opts?: any) {
      try {
        const token = getToken();
        const form = new FormData();
        const f = file instanceof File ? file : new File([file], path, { type: file.type });
        form.append('file', f);
        const res = await fetch(`${BASE_URL}/branding/${encodeURIComponent(path)}`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        });
        if (!res.ok) return { data: null, error: { message: `${res.status}` } };
        return { data: { path }, error: null };
      } catch (err: any) {
        return { data: null, error: { message: err.message } };
      }
    },

    async remove(paths: string[]) {
      try {
        for (const p of paths) {
          await apiFetch(`/branding/${encodeURIComponent(p)}`, { method: 'DELETE' });
        }
        return { data: paths.map((p) => ({ name: p })), error: null };
      } catch (err: any) {
        return { data: null, error: { message: err.message } };
      }
    },

    async createSignedUrl(path: string, _expiresIn?: number) {
      // Serve branding assets via the public endpoint (no auth needed for logos/seals)
      return {
        data: { signedUrl: `${BASE_URL}/branding/public/${encodeURIComponent(path)}` },
        error: null,
      };
    },

    getPublicUrl(path: string) {
      return {
        data: { publicUrl: `${BASE_URL}/branding/public/${encodeURIComponent(path)}` },
      };
    },
  };
}

// ─── Auth adapter ─────────────────────────────────────────────────────────────

const auth = {
  async getUser() {
    const token = getToken();
    if (!token) return { data: { user: null }, error: null };
    const payload = decodeJwt(token);
    if (!payload) return { data: { user: null }, error: null };
    return {
      data: {
        user: {
          id: payload.sub,
          email: payload.email ?? null,
          role: payload.role ?? 'user',
        },
      },
      error: null,
    };
  },

  async getSession() {
    const token = getToken();
    if (!token) return { data: { session: null }, error: null };
    return {
      data: { session: { access_token: token } },
      error: null,
    };
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => 'Invalid credentials');
        return { data: null, error: { message: msg } };
      }
      const { token, user } = await res.json();
      if (typeof window !== 'undefined') localStorage.setItem('cemis_token', token);
      return { data: { user, session: { access_token: token } }, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  },

  async signOut() {
    if (typeof window !== 'undefined') localStorage.removeItem('cemis_token');
    return { error: null };
  },

  // Called by __root.tsx to listen for auth events.
  // Returns a subscription object; the actual invalidation is driven by cemisAuth.
  onAuthStateChange(_callback: (event: string, session: any) => void) {
    return {
      data: { subscription: { unsubscribe: () => {} } },
    };
  },

  // No-op: OAuth is not used with the Spring Boot backend.
  async setSession(_tokens: any) {
    return { data: null, error: null };
  },

  // Stub used by legacy auth-middleware
  async getClaims(token: string) {
    const payload = decodeJwt(token);
    if (!payload) return { data: null, error: { message: 'Invalid token' } };
    return { data: { claims: { sub: payload.sub, email: payload.email, role: payload.role } }, error: null };
  },
};

// ─── Main export ─────────────────────────────────────────────────────────────

export const supabase = {
  from(table: string) {
    return new QueryBuilder(table);
  },

  auth,

  storage: {
    from: storageFrom,
  },
};
