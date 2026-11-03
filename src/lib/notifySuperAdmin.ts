import { supabase } from "@/integrations/supabase/client";

type AlertEvent = "admin_signup" | "app_error" | "important";

export async function notifySuperAdmin(event: AlertEvent, message: string, details?: Record<string, string | number>) {
  try {
    await supabase.functions.invoke("notify-super-admin", { body: { event, message: message.slice(0, 2000), details } });
  } catch {
    // never break the app because an alert failed
  }
}

let installed = false;
const recent = new Set<string>();
export function installErrorAlerts() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const report = (msg: string, stack?: string) => {
    if (!msg || recent.has(msg) || recent.size > 20) return;
    recent.add(msg);
    notifySuperAdmin("app_error", msg, { Page: window.location.pathname, ...(stack ? { Stack: stack.slice(0, 1500) } : {}) });
  };
  window.addEventListener("error", (e) => report(e.message, e.error?.stack));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    report(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined);
  });
}
