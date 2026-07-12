/**
 * REST API client for the CeMIS Spring Boot backend.
 * Replace all Supabase direct-table calls with these helpers.
 * Base URL is read from VITE_API_URL (defaults to http://localhost:8080/api).
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

// ── Base fetch ────────────────────────────────────────────────────────────────

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
    body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `${method} ${path} → ${res.status}`;
    try { const err = await res.json(); message = err.message ?? message; } catch {}
    throw new Error(message);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") return undefined as T;
  return res.json();
}

const get  = <T>(path: string)              => request<T>("GET",    path);
const post = <T>(path: string, body: unknown) => request<T>("POST",   path, body);
const put  = <T>(path: string, body: unknown) => request<T>("PUT",    path, body);
const patch= <T>(path: string, body: unknown) => request<T>("PATCH",  path, body);
const del  = <T>(path: string)              => request<T>("DELETE", path);

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
    const res = await post<{ token: string } & AuthUser>("/auth/login", { email, password });
    setToken(res.token);
    return res;
  },
  logout: () => { clearToken(); },
  me: () => get<AuthUser>("/auth/me"),
  changePassword: (newPassword: string) =>
    post<{ ok: boolean }>("/auth/change-password", { newPassword }),
};

// ── Students ──────────────────────────────────────────────────────────────────

export type Student = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  unzaStudentId: string | null;
  category: "unza" | "non_unza";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export const students = {
  list:   ()              => get<Student[]>("/students"),
  get:    (id: string)    => get<Student>(`/students/${id}`),
  create: (data: Partial<Student>) => post<Student>("/students", data),
  update: (id: string, data: Partial<Student>) => put<Student>(`/students/${id}`, data),
  delete: (id: string)    => del<{ ok: boolean }>(`/students/${id}`),
  importCsv: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ imported: number; students: Student[] }>("POST", "/students/import", fd, true);
  },
};

// ── Courses ───────────────────────────────────────────────────────────────────

export type Course = {
  id: string;
  code: string;
  prefix: string;
  name: string;
  description: string | null;
  category: string;
  mode: string | null;
  durationText: string | null;
  feeUnza: number | null;
  feeNonUnza: number | null;
  startDate: string | null;
  timeSlot: string | null;
  active: boolean;
  createdAt: string;
};

export const courses = {
  list:         ()              => get<Course[]>("/courses"),
  listActive:   ()              => get<Course[]>("/courses?active=true"),
  get:          (id: string)    => get<Course>(`/courses/${id}`),
  create:       (data: Partial<Course>) => post<Course>("/courses", data),
  update:       (id: string, data: Partial<Course>) => put<Course>(`/courses/${id}`, data),
  delete:       (id: string)    => del<{ ok: boolean }>(`/courses/${id}`),
};

// ── Enrolments ────────────────────────────────────────────────────────────────

export type EnrolmentStatus = "enrolled" | "in_progress" | "completed" | "certified";
export type PaymentStatus   = "pending" | "paid" | "waived" | "free";

export type Enrolment = {
  id: string;
  student: Student | null;
  course:  Course  | null;
  status:  EnrolmentStatus;
  paymentStatus: PaymentStatus;
  feeCharged: number | null;
  enrolledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  certificate: { id: string; certificateCode: string } | null;
  notes: string | null;
};

export const enrolments = {
  list: () => get<Enrolment[]>("/enrolments"),
  get:  (id: string) => get<Enrolment>(`/enrolments/${id}`),
  create: (data: {
    student_id: string;
    course_id: string;
    fee_charged?: number | null;
    payment_status?: PaymentStatus;
  }) => post<Enrolment>("/enrolments", data),
  updateStatus:  (id: string, status: EnrolmentStatus) =>
    patch<Enrolment>(`/enrolments/${id}/status`, { status }),
  updatePayment: (id: string, payment_status: PaymentStatus) =>
    patch<Enrolment>(`/enrolments/${id}/payment`, { payment_status }),
  bulkStart: (ids: string[]) =>
    post<{ updated: number }>("/enrolments/bulk-start", { ids }),
  delete: (id: string) => del<{ ok: boolean }>(`/enrolments/${id}`),
};

// ── Certificates ──────────────────────────────────────────────────────────────

export type Certificate = {
  id: string;
  certificateId: string;
  certificateCode: string | null;
  student: Student | null;
  course: Course | null;
  recipientName: string;
  recipientEmail: string | null;
  programme: string;
  issuerName: string;
  issueDate: string;
  status: "valid" | "revoked";
  emailStatus: string;
  emailSentAt: string | null;
  pdfPath: string | null;
  nationalId: string | null;
  createdAt: string;
};

export const certificates = {
  list: () => get<Certificate[]>("/certificates"),
  get:  (id: string) => get<Certificate>(`/certificates/${id}`),
  generate: (enrolmentId: string) =>
    post<Certificate>("/certificates/generate", { enrolmentId }),
  uploadPdf: async (id: string, blob: Blob, code: string) => {
    const fd = new FormData();
    fd.append("file", blob, `${code}.pdf`);
    return request<{ ok: boolean }>("POST", `/certificates/${id}/pdf`, fd, true);
  },
  pdfDownloadUrl: (id: string) => `${BASE}/certificates/${id}/pdf?token=${getToken() ?? ""}`,
  sendEmail: (id: string) => post<{ ok: boolean; sentTo: string }>(`/certificates/${id}/send-email`, {}),
  verify:    (code: string) => get<{ verified: boolean; reason: string; certificate: Certificate | null }>(`/certificates/verify/${encodeURIComponent(code)}`),
};

// ── Settings ──────────────────────────────────────────────────────────────────

export type OrgSettings = {
  orgName: string;
  orgPrefix: string;
  signatory1Name: string;
  signatory1Title: string;
  signatory2Name: string;
  signatory2Title: string;
  templateLayout: Record<string, unknown> | null;
};

export const settings = {
  get:    ()                        => get<OrgSettings>("/settings"),
  update: (data: Partial<OrgSettings>) => put<OrgSettings>("/settings", data),
};

// ── Users ─────────────────────────────────────────────────────────────────────

export type AdminUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: "admin" | "user";
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

export const adminUsers = {
  list:   ()              => get<AdminUser[]>("/users"),
  create: (data: { email: string; password: string; fullName: string; role: string }) =>
    post<AdminUser>("/users", data),
  update: (id: string, data: Partial<AdminUser>) => put<AdminUser>(`/users/${id}`, data),
  delete: (id: string)    => del<{ ok: boolean }>(`/users/${id}`),
};

// ── Reports ───────────────────────────────────────────────────────────────────

export type OverviewStats = {
  totalStudents:   number;
  totalCourses:    number;
  totalEnrolments: number;
  totalCertificates: number;
  enrolled:   number;
  inProgress: number;
  completed:  number;
  certified:  number;
};

export const reports = {
  stats:    () => get<OverviewStats>("/reports/stats"),
  auditLog: (page = 0, size = 50) => get<{
    content: unknown[];
    totalElements: number;
    totalPages: number;
    page: number;
  }>(`/reports/audit-log?page=${page}&size=${size}`),
};
