import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "manager" | "cashier";

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userList, error: uErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (uErr) throw new Error(uErr.message);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id,role");
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id,full_name");
    return userList.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      full_name: profiles?.find((p) => p.id === u.id)?.full_name ?? null,
      role: (roles?.find((r) => r.user_id === u.id)?.role ?? "cashier") as Role,
      created_at: u.created_at,
    }));
  });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; full_name: string; role: Role }) => d)
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const uid = created.user.id;
    // trigger already inserts a role; override to requested role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    await supabaseAdmin.from("profiles").upsert({ id: uid, full_name: data.full_name });
    return { id: uid };
  });

export const setStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; role: Role }) => d)
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string }) => d)
  .handler(async ({ data, context }) => {
    if (data.user_id === context.userId) throw new Error("Cannot delete yourself");
    const { data: roleRow } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
