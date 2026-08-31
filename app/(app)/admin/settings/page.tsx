import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/common/page-header";
import { SchoolSettingsForm } from "@/components/admin/school-settings-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireRole(["admin"]);

  // The two Parent Portal values live in pta.school_settings as key/value rows
  // rather than as columns on pta.schools: they configure surfaces OUTSIDE this
  // app -- a payment rail and a Telegram bot -- and neither is printed on a
  // receipt, which is what the columns on `schools` are for.
  const supabase = await createClient();
  const [{ data: settings }, { data: notifyConfig }] = await Promise.all([
    supabase
      .from("school_settings")
      .select("key, value")
      .eq("school_id", ctx.activeSchool.id)
      .in("key", ["gcash_number", "telegram_bot", "portal_require_pin"]),
    supabase
      .from("gate_notify_config")
      .select("enabled")
      .eq("school_id", ctx.activeSchool.id)
      .maybeSingle(),
  ]);

  const read = (key: string) => {
    const row = (settings ?? []).find(
      (s) => (s as { key: string }).key === key,
    ) as { value?: unknown } | undefined;
    const value = row?.value;
    if (typeof value === "string") return value;
    // Tolerates a row hand-written as an object in the SQL editor, matching
    // what pta.v_portal_account and v_portal_telegram accept.
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const inner = obj.username ?? obj.number;
      if (typeof inner === "string") return inner;
    }
    return "";
  };

  // Absent row and a stored `false` mean the same thing — see saveSchoolSettings.
  const requirePin = (() => {
    const row = (settings ?? []).find(
      (r) => (r as { key: string }).key === "portal_require_pin",
    ) as { value?: unknown } | undefined;
    const value = row?.value;
    if (typeof value === "boolean") return value;
    if (value && typeof value === "object") {
      return Boolean((value as Record<string, unknown>).required);
    }
    return value === "true";
  })();

  return (
    <>
      <PageHeader
        title="School settings"
        description="These values appear on every receipt and report this school produces."
      />
      <SchoolSettingsForm
        school={ctx.activeSchool}
        gcashNumber={read("gcash_number")}
        telegramBotUsername={read("telegram_bot")}
        requirePin={requirePin}
        // No row means OFF -- claim_notifications() returns early on `not
        // found`, so an unconfigured school silently sends nothing.
        gateNotifyEnabled={
          Boolean((notifyConfig as { enabled?: boolean } | null)?.enabled)
        }
      />
    </>
  );
}
