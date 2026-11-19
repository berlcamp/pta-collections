"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { globalSettingsSchema } from "@/lib/validations/admin";
import type { ActionResult } from "./types";

/**
 * Deployment-wide settings (0033). Super admin only, here and again in RLS on
 * pta.app_settings. Today that is the one Telegram bot every school shares —
 * the same bot TELEGRAM_BOT_TOKEN sends from.
 */
export async function saveGlobalSettings(input: unknown): Promise<ActionResult> {
  const ctx = await requireSession();
  if (!ctx.isSuperAdmin) {
    return { ok: false, error: "Only a super admin can change global settings." };
  }
  const parsed = globalSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const handle = parsed.data.telegram_bot_username;
  const { error } = handle
    ? await supabase
        .from("app_settings")
        .upsert({ key: "telegram_bot", value: handle }, { onConflict: "key" })
    : // Cleared rather than stored empty, so each school falls back to its
      // own old setting (if any) instead of to a blank link.
      await supabase.from("app_settings").delete().eq("key", "telegram_bot");

  if (error) return { ok: false, error: error.message };

  revalidatePath("/super/settings");
  revalidatePath("/portal/telegram");
  return { ok: true, data: undefined };
}
