import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type BaseRole = "admin" | "manager" | "cashier" | "sales_executive" | "store_keeper";
const BASE_ROLES: BaseRole[] = ["admin", "manager", "cashier", "sales_executive", "store_keeper"];

type Ctx = { supabase: any; userId: string };

async function myLevel(context: Ctx): Promise<"admin" | "manager" | null> {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("manager")) return "manager";
  return null;
}

async function resolveDesignation(roleKey: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_roles").select("key,base_role").eq("key", roleKey).maybeSingle();
  if (!data) throw new Error("Unknown role");
  const base = (BASE_ROLES.includes(data.base_role as BaseRole) ? data.base_role : "cashier") as BaseRole;
  return { key: data.key, base };
}

async function actorName(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return data?.full_name ?? null;
}

async function writeLog(userId: string, action: string, summary: string, entityId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("activity_logs").insert({
      area: "staff", action, summary, entity_id: entityId, actor_id: userId, actor_name: await actorName(userId),
    });
  } catch { /* best effort */ }
}

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await myLevel(context as Ctx))) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userList, error: uErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (uErr) throw new Error(uErr.message);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id,role,role_key");
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id,full_name");
    return userList.users.map((u) => {
      const r = roles?.find((x) => x.user_id === u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        full_name: profiles?.find((p) => p.id === u.id)?.full_name ?? null,
        role_key: (r?.role_key as string | null) || (r?.role as string | undefined) || "cashier",
        base_role: (r?.role ?? "cashier") as BaseRole,
        created_at: u.created_at,
      };
    });
  });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; full_name: string; role_key: string }) => d)
  .handler(async ({ data, context }) => {
    const level = await myLevel(context as Ctx);
    if (!level) throw new Error("Forbidden");
    const des = await resolveDesignation(data.role_key);
    if (level === "manager" && des.base === "admin") throw new Error("Managers cannot create admins");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email, password: data.password, email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const uid = created.user.id;
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: des.base, role_key: des.key });
    await supabaseAdmin.from("profiles").upsert({ id: uid, full_name: data.full_name });
    await writeLog(context.userId, "create", `Added staff ${data.full_name} (${data.email}) as ${des.key}`, uid);
    return { id: uid };
  });

export const setStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; role_key: string }) => d)
  .handler(async ({ data, context }) => {
    if ((await myLevel(context as Ctx)) !== "admin") throw new Error("Only admins can change roles");
    const des = await resolveDesignation(data.role_key);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: des.base, role_key: des.key });
    if (error) throw new Error(error.message);
    await writeLog(context.userId, "role-change", `Changed role of user to ${des.key}`, data.user_id);
    return { ok: true };
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string }) => d)
  .handler(async ({ data, context }) => {
    if (data.user_id === context.userId) throw new Error("Cannot delete yourself");
    if ((await myLevel(context as Ctx)) !== "admin") throw new Error("Only admins can remove staff");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    await writeLog(context.userId, "delete", `Removed staff user`, data.user_id);
    return { ok: true };
  });
