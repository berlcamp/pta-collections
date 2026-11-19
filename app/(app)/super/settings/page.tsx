import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/common/page-header";
import { GlobalSettingsForm } from "@/components/super/global-settings-form";

export const dynamic = "force-dynamic";

/** Settings that belong to the whole deployment rather than to one school. */
export default async function SuperSettingsPage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "telegram_bot")
    .maybeSingle<{ value: unknown }>();

  const v = data?.value;
  const telegramBot =
    typeof v === "string"
      ? v
      : v && typeof v === "object" && "username" in v
        ? String((v as { username: unknown }).username ?? "")
        : "";

  return (
    <>
      <PageHeader
        title="Global settings"
        description="Shared by every school on this deployment."
      />
      <GlobalSettingsForm telegramBot={telegramBot} />
    </>
  );
}
