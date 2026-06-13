import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listUsers = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");

    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      full_name: (u.user_metadata?.full_name as string | undefined) ?? null,
      phone: (u.user_metadata?.phone as string | undefined) ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      role: (roles ?? []).find((r) => r.user_id === u.id)?.role ?? null,
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
    const { email, password, role, full_name, phone } = data;

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone: phone ?? null },
    });
    if (error) throw error;

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role });
    if (roleErr) throw roleErr;

    // Flag account so the user is forced to change password on first sign-in
    await (supabaseAdmin as any)
      .from("user_settings")
      .insert({ user_id: created.user.id, must_change_password: true });

    return { id: created.user.id, email: created.user.email ?? email };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { userId } = data;
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;
    return { ok: true };
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string().uuid(), role: z.enum(["admin", "user"]) }))
  .handler(async ({ data }) => {
    const { userId, role } = data;
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
    if (error) throw error;
    return { ok: true };
  });
