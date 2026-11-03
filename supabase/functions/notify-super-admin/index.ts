import { createClient } from "https://esm.sh/@supabase/supabase-js@2.80.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { sendSuperAdminAlert } from "../_shared/notify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  event: z.enum(["admin_signup", "app_error", "important"]),
  message: z.string().min(1).max(2000),
  details: z.record(z.union([z.string().max(2000), z.number()])).optional(),
});

const TITLES: Record<string, string> = {
  admin_signup: "New admin awaiting approval",
  app_error: "Something went wrong in the web app",
  important: "Important app event",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { event, message, details } = parsed.data;

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let userEmail: string | undefined;
    const auth = req.headers.get("Authorization");
    if (auth) {
      const { data } = await createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: auth } },
      }).auth.getUser();
      userEmail = data.user?.email;
    }
    // Only signed-in users may send non-error alerts.
    if (event !== "app_error" && !userEmail) return json({ error: "Unauthorized" }, 401);

    // Throttle: skip identical alerts sent in the last 10 minutes.
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin.from("system_logs").select("id", { count: "exact", head: true })
      .eq("source", "email-alert").eq("message", `${event}: ${message}`).gte("created_at", since);
    if ((count ?? 0) > 0) return json({ skipped: true });

    await admin.from("system_logs").insert({
      log_level: event === "app_error" ? "error" : "info",
      source: "email-alert",
      message: `${event}: ${message}`,
      metadata: { ...(details ?? {}), user: userEmail ?? "signed out" },
    });

    await sendSuperAdminAlert(TITLES[event], { Message: message, User: userEmail ?? "Signed out visitor", ...(details ?? {}) });
    return json({ sent: true });
  } catch (e) {
    console.error("notify-super-admin failed:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
