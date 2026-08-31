"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { mintPortalToken } from "@/lib/portal/jwt";
import {
  requirePortalSession,
  setPortalSession,
} from "@/lib/portal/session";
import { createPortalClient } from "@/lib/portal/supabase";
import type { ActionResult } from "./types";
import { dbId } from "@/lib/validations/id";

/**
 * The parent's write verbs.
 *
 * Every one is a SECURITY DEFINER RPC that begins by resolving
 * `pta.current_guardian_id()`. Nothing here writes a table, and nothing here
 * decides what the parent may touch — `requirePortalSession()` below is the
 * outer door, not the lock. A forged cookie reaches an RPC that resolves no
 * guardian and raises.
 */

const claimSchema = z
  .object({
    claimType: z.enum(["fee", "donation"]),
    studentId: dbId().optional().nullable(),
    programId: dbId().optional().nullable(),
    items: z
      .array(z.object({ charge_id: dbId(), amount: z.number().positive() }))
      .optional()
      .nullable(),
    amount: z.number().positive("Enter the amount you sent."),
    paymentMethod: z.enum(["gcash", "bank_transfer", "other"]).default("gcash"),
    referenceNumber: z
      .string()
      .trim()
      .min(4, "Copy the reference number from your GCash receipt."),
    proofPath: z.string().trim().optional().nullable(),
    isAnonymous: z.boolean().default(false),
    remarks: z.string().trim().max(500).optional().nullable(),
  })
  .refine((v) => v.claimType !== "fee" || (v.studentId && v.items?.length), {
    message: "Select the fees you are paying.",
  })
  .refine((v) => v.claimType !== "donation" || Boolean(v.programId), {
    message: "Choose a project to support.",
  });

export async function submitClaim(input: unknown): Promise<ActionResult<string>> {
  await requirePortalSession();

  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }
  const v = parsed.data;

  const supabase = await createPortalClient();
  const { data, error } = await supabase.rpc("submit_payment_claim", {
    p_claim_type: v.claimType,
    p_student_id: v.studentId ?? null,
    p_program_id: v.programId ?? null,
    p_items: v.items ?? null,
    p_claimed_amount: v.amount,
    p_payment_method: v.paymentMethod,
    p_reference_number: v.referenceNumber,
    p_proof_path: v.proofPath ?? null,
    p_is_anonymous: v.isAnonymous,
    p_remarks: v.remarks ?? null,
  });

  // The RPC's messages are written FOR THE PARENT — "This student is not
  // enrolled for the current school year", not a constraint name — so they are
  // surfaced rather than swallowed. The one exception is the unique index on
  // (school_id, reference_number), which speaks Postgres.
  if (error) {
    return {
      ok: false,
      error: error.message.includes("payment_claims_reference_idx")
        ? "That reference number has already been submitted."
        : error.message,
    };
  }

  revalidatePath("/portal");
  revalidatePath("/portal/claims");
  revalidatePath("/portal/balances");
  return { ok: true, data: data as string };
}

const pledgeSchema = z.object({
  programId: z.uuid("Choose a project."),
  amount: z.number().positive("Enter the amount you plan to give."),
  dueDate: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

/**
 * A pledge moves no money, so it needs no review queue and writes directly.
 * 0014 deliberately puts no overpayment guard on pledges — over-delivering on a
 * promise is generosity, not an error.
 */
export async function createPortalPledge(input: unknown): Promise<ActionResult> {
  await requirePortalSession();

  const parsed = pledgeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }

  const supabase = await createPortalClient();
  const { error } = await supabase.rpc("portal_create_pledge", {
    p_program_id: parsed.data.programId,
    p_amount: parsed.data.amount,
    p_due_date: parsed.data.dueDate || null,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/give");
  return { ok: true, data: undefined };
}

/**
 * Mint a Telegram deep link for THIS guardian.
 *
 * 15 minutes, single-use, and bound to the guardian so redemption attaches the
 * chat to the person already signed in rather than inventing a second
 * `parents_guardians` row from their Telegram display name — which is what
 * 0013 did, and would have left the portal saying "not linked" forever while
 * the bot messaged a duplicate identity.
 */
export async function issueTelegramLink(
  force = false,
): Promise<ActionResult<{ deepLink: string | null; expiresAt: string; reused: boolean }>> {
  await requirePortalSession();

  const supabase = await createPortalClient();
  // Default false: a repeat tap returns the link the parent is already holding
  // in Telegram. Minting a fresh one would retire theirs mid-flow, which is
  // what "That link has expired" was (0019).
  const { data, error } = await supabase.rpc("portal_issue_enroll_token", {
    p_force: force,
  });
  if (error) return { ok: false, error: error.message };

  const result = data as {
    ok: boolean;
    reason?: string;
    reused?: boolean;
    deep_link: string | null;
    expires_at: string;
  };

  if (!result?.ok) {
    return {
      ok: false,
      error:
        result?.reason === "no_children"
          ? "No children are linked to this card yet."
          : "Could not create a link right now.",
    };
  }

  revalidatePath("/portal/telegram");
  return {
    ok: true,
    data: {
      deepLink: result.deep_link,
      expiresAt: result.expires_at,
      reused: Boolean(result.reused),
    },
  };
}

/**
 * "Did it work?" — polled by the guide page while the parent is away in
 * Telegram. Redemption happens out of band, in an Edge Function, so there is
 * nothing to await; the page asks every few seconds until the chat id lands.
 */
export async function checkTelegramLinked(): Promise<boolean> {
  await requirePortalSession();

  const supabase = await createPortalClient();
  const { data } = await supabase
    .from("v_portal_telegram")
    .select("is_linked")
    .maybeSingle();

  return Boolean((data as { is_linked?: boolean } | null)?.is_linked);
}

export async function setTelegramNotify(on: boolean): Promise<ActionResult> {
  await requirePortalSession();

  const supabase = await createPortalClient();
  const { error } = await supabase.rpc("portal_set_notify", { p_on: on });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/telegram");
  return { ok: true, data: undefined };
}

/**
 * The containment for a forwarded deep link. A parent who sees a name that is
 * not theirs on the guide page can cut it at 9pm, instead of waiting for the
 * office to open.
 */
export async function unlinkTelegram(): Promise<ActionResult> {
  await requirePortalSession();

  const supabase = await createPortalClient();
  const { error } = await supabase.rpc("portal_unlink_telegram");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/telegram");
  return { ok: true, data: undefined };
}

export async function setPortalLocale(locale: "en" | "tl"): Promise<void> {
  const session = await requirePortalSession();

  const supabase = await createPortalClient();
  await supabase.rpc("portal_set_locale", { p_locale: locale });

  // The locale rides in the session token so every page can read it without a
  // query, which means the token has to be re-minted for the switch to survive
  // a navigation. Same claims, same guardian, one field different.
  await setPortalSession(mintPortalToken({ ...session, locale }));
  revalidatePath("/portal", "layout");
}

/**
 * Upload a GCash screenshot.
 *
 * Path is {school_id}/{guardian_id}/{uuid}.{ext}, which is exactly what the
 * insert policy in 0016 matches on — a parent can write into their own folder
 * and nowhere else, and cannot read the bucket back at all.
 */
export async function uploadProof(formData: FormData): Promise<ActionResult<string>> {
  const session = await requirePortalSession();

  const file = formData.get("proof");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a screenshot to attach." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "That image is larger than 5 MB." };
  }
  if (!/^image\/(png|jpe?g|webp|heic)$/i.test(file.type)) {
    return { ok: false, error: "Attach a photo or screenshot." };
  }

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${session.school_id}/${session.guardian_id}/${crypto.randomUUID()}.${ext}`;

  const supabase = await createPortalClient();
  const { error } = await supabase.storage
    .from("pta-payment-proofs")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: path };
}
