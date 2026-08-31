"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isValidCardNumber, normalizeCardNumber } from "@/lib/portal/card";
import { mintPortalToken } from "@/lib/portal/jwt";
import {
  clearPortalSession,
  getPortalSession,
  setPortalSession,
} from "@/lib/portal/session";
import {
  createPortalAnonClient,
  createPortalClient,
} from "@/lib/portal/supabase";
import type { ActionResult } from "./types";

/**
 * Portal sign-in.
 *
 * The PIN is never hashed or compared here. `pta.portal_login()` takes the raw
 * PIN and returns an identity — a hash never crosses the wire, because the only
 * key this app holds is the anon key and the anon key is public. An RPC that
 * returned a hash for TypeScript to check would let anyone harvest every hash
 * in the school; a 6-digit PIN falls to an offline attack in seconds.
 *
 * Lockout, the IP throttle and the "is this card even active" question all live
 * in that function too. Nothing below decides whether a login succeeds.
 */

const loginSchema = z.object({
  cardNumber: z
    .string()
    .transform(normalizeCardNumber)
    .refine(isValidCardNumber, "Check the card number and try again."),
  // Optional since 0017: whether a PIN is needed is a per-school setting, and
  // the form cannot know which school a card belongs to until it is submitted.
  // So the card goes up alone, and portal_login() answers 'pin_required' when
  // one is wanted -- for a REAL card only, so the answer is not an oracle.
  pin: z
    .string()
    .regex(/^[0-9]{6}$/, "A PIN is exactly 6 digits.")
    .optional()
    .or(z.literal("")),
});

type LoginOutcome =
  | { ok: true; mustChangePin: boolean }
  | { ok: false; error: string; reason?: string; attemptsLeft?: number };

export async function portalLogin(input: unknown): Promise<LoginOutcome> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    // Deliberately the same message a wrong PIN gets: a distinct "no such card"
    // would turn this form into a card-number oracle.
    return { ok: false, error: "That card number or PIN is not correct." };
  }

  const supabase = createPortalAnonClient();
  const { data, error } = await supabase.rpc("portal_login", {
    p_card_number: parsed.data.cardNumber,
    p_pin: parsed.data.pin || null,
    p_ip: await clientIp(),
  });

  if (error) return { ok: false, error: error.message };

  const result = data as {
    ok: boolean;
    reason?: string;
    guardian_id?: string;
    account_id?: string;
    school_id?: string;
    school_name?: string;
    locale?: "en" | "tl";
    must_change_pin?: boolean;
    pin_required?: boolean;
    attempts_left?: number;
  };

  if (!result?.ok) {
    return {
      ok: false,
      reason: result?.reason,
      attemptsLeft: result?.attempts_left,
      error:
        result?.reason === "locked"
          ? "This card is locked after too many wrong PINs."
          : result?.reason === "throttled"
            ? "Too many attempts from this device. Please wait a few minutes."
            : result?.reason === "pin_required"
              ? "This school also asks for a PIN."
              : "That card number or PIN is not correct.",
    };
  }

  await setPortalSession(
    mintPortalToken({
      sub: result.account_id!,
      guardian_id: result.guardian_id!,
      school_id: result.school_id!,
      school_name: result.school_name ?? "",
      locale: result.locale ?? "en",
    }),
  );

  return { ok: true, mustChangePin: Boolean(result.must_change_pin) };
}

const changePinSchema = z
  .object({
    currentPin: z.string().regex(/^[0-9]{6}$/, "A PIN is exactly 6 digits."),
    newPin: z.string().regex(/^[0-9]{6}$/, "A PIN is exactly 6 digits."),
    confirmPin: z.string(),
  })
  .refine((v) => v.newPin === v.confirmPin, {
    message: "The two PINs do not match.",
    path: ["confirmPin"],
  });

export async function portalChangePin(input: unknown): Promise<ActionResult> {
  if (!(await getPortalSession())) redirect("/portal/login");

  const parsed = changePinSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the PINs and try again.",
    };
  }

  const supabase = await createPortalClient();
  const { data, error } = await supabase.rpc("portal_change_pin", {
    p_old_pin: parsed.data.currentPin,
    p_new_pin: parsed.data.newPin,
  });

  if (error) return { ok: false, error: error.message };

  const result = data as { ok: boolean; reason?: string };
  if (!result?.ok) {
    return {
      ok: false,
      error:
        result?.reason === "wrong_pin"
          ? "That is not your current PIN."
          : result?.reason === "too_common"
            ? "That PIN is too easy to guess. Please choose another."
            : "A PIN is exactly 6 digits.",
    };
  }

  return { ok: true, data: undefined };
}

export async function portalSignOut(): Promise<void> {
  await clearPortalSession();
  redirect("/portal/login");
}

/**
 * Best-effort client IP for the throttle in `portal_login()`.
 *
 * Behind Vercel this is real. Behind nothing it is 'unknown', and the throttle
 * then counts every anonymous attempt into one bucket — which is a blunt
 * instrument, not a broken one, and is still better than no ceiling at all.
 */
async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}
