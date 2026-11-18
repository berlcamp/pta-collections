"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";

import {
  checkTelegramLinked,
  issueTelegramLink,
  setTelegramNotify,
  unlinkTelegram,
} from "@/app/actions/portal";
import {
  portalButton,
  portalCard,
  portalGhostButton,
} from "@/components/portal/styles";
import { Switch } from "@/components/ui/switch";
import { t } from "@/lib/portal/i18n";
import { cn } from "@/lib/utils";
import type { PortalLocale, PortalTelegramStatus } from "@/types/database.types";

/**
 * The connect button, and the "did it work?" block.
 *
 * NOT a QR code. A QR exists to move a link from PAPER to a phone — and the
 * parent is already on the phone, signed in, with Telegram installed on the
 * same device. Tapping hands straight off to the app. QR stays on the printed
 * office slip, where it earns its keep.
 *
 * The token behind this link lives 15 minutes, is single-use, and is bound to
 * this guardian. It is still a bearer credential: whoever redeems it starts
 * receiving a child's arrival photos. The short life narrows the window; the
 * status block below — which names the account that connected, and offers to
 * cut it — is what actually closes it.
 */
export function TelegramConnect({
  status,
  locale,
}: {
  status: PortalTelegramStatus;
  locale: PortalLocale;
}) {
  const copy = t(locale);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setWaiting(false);
  }, []);

  // Redemption happens in an Edge Function, out of band, so there is no promise
  // to await — the page just asks until the answer changes. Capped at 2 minutes
  // so a parent who wandered off does not leave a request loop running.
  useEffect(() => {
    if (!waiting) return;

    const started = Date.now();
    timer.current = setInterval(async () => {
      if (Date.now() - started > 120_000) return stopPolling();
      if (await checkTelegramLinked()) {
        stopPolling();
        toast.success(copy.telegramDone);
        router.refresh();
      }
    }, 3000);

    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [waiting, copy.telegramDone, router, stopPolling]);

  function connect(force = false) {
    setError(null);

    // Opened SYNCHRONOUSLY, before any await.
    //
    // Mobile Safari only allows window.open inside a live user gesture, and an
    // awaited server call ends that gesture — so opening the tab after the mint
    // was silently blocked on every iPhone. The fix is the standard one: claim
    // a blank tab now, while the tap is still in scope, and point it at the
    // deep link once the token comes back.
    //
    // No "noopener" feature string here, deliberately: passing it makes
    // window.open return null by specification, which would throw away the very
    // handle this needs. opener is nulled by hand below instead.
    const popup = window.open("", "_blank");

    startTransition(async () => {
      const result = await issueTelegramLink(force);
      if (!result.ok) {
        popup?.close();
        setError(result.error);
        return;
      }
      if (!result.data.deepLink) {
        popup?.close();
        setError(copy.telegramNoBot);
        return;
      }

      setLink(result.data.deepLink);
      setWaiting(true);

      // A new tab rather than a navigation: the portal page has to survive, or
      // the "did it work?" block is gone when they switch back from Telegram.
      if (popup && !popup.closed) {
        popup.opener = null;
        popup.location.replace(result.data.deepLink);
      }
      // If it WAS blocked, popup is null and nothing opens — which is exactly
      // what the anchor below is for. It is a real link, so the tap on it is
      // its own gesture and no blocker applies.
    });
  }

  if (status.is_linked) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-3xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-500 text-white">
            <CheckCircle2 className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-emerald-900">{copy.telegramLinked}</p>
            <p className="text-sm text-emerald-800/80">
              {status.notifying_children} / {status.total_children}
            </p>
          </div>
        </div>

        <label
          className={cn(
            portalCard,
            "flex min-h-16 cursor-pointer items-center justify-between gap-3 px-4",
          )}
        >
          <span className="text-[0.95rem] font-medium text-slate-900">
            {copy.telegramNotifications}
          </span>
          <Switch
            checked={status.telegram_active}
            disabled={pending}
            onCheckedChange={(on) =>
              startTransition(async () => {
                await setTelegramNotify(on);
                router.refresh();
              })
            }
          />
        </label>

        <button
          type="button"
          className={portalGhostButton}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await unlinkTelegram();
              toast.success(copy.telegramUnlinked);
              router.refresh();
            })
          }
        >
          <Unlink className="size-4" />
          {copy.telegramUnlink}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!link ? (
        <button
          type="button"
          className={portalButton}
          disabled={pending || !status.bot_username}
          // Wrapped, not passed by reference: onClick hands the handler a
          // MouseEvent, which would land in `force` and make every first tap a
          // forced refresh — the churn 0019 exists to remove.
          onClick={() => connect()}
        >
          {pending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <ExternalLink className="size-5" />
          )}
          {copy.telegramConnect}
        </button>
      ) : (
        // Once a link exists it is always on screen as a REAL anchor. Whether
        // the tab above opened, was blocked, or was closed by mistake, there is
        // one obvious thing to tap — and tapping a link is its own gesture, so
        // no popup blocker is involved.
        <a href={link} target="_blank" rel="noopener noreferrer" className={portalButton}>
          <ExternalLink className="size-5" />
          {copy.telegramTapToOpen}
        </a>
      )}

      {!status.bot_username && (
        <p className="rounded-2xl bg-slate-100 p-3.5 text-sm text-slate-600">
          {copy.telegramNoBot}
        </p>
      )}

      {waiting && (
        <div className="flex items-center gap-3 rounded-3xl bg-blue-50 p-4 ring-1 ring-blue-100">
          <Loader2 className="size-5 shrink-0 animate-spin text-blue-600" />
          <p className="flex-1 text-sm font-medium text-blue-900">{copy.telegramWaiting}</p>
          <button
            type="button"
            aria-label="Refresh"
            className="grid size-11 cursor-pointer place-items-center rounded-full text-blue-700 hover:bg-blue-100"
            onClick={() => router.refresh()}
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      )}

      {/* Plain text as the last resort — for a parent on a laptop with Telegram
          on a different phone, and for anything the two paths above miss.
          Deliberately NOT gated on !waiting: it was, and since waiting is set in
          the same breath as the link, the fallback could never appear at the one
          moment it was needed. */}
      {link && (
        <div className="space-y-1.5">
          <p className="text-center text-xs text-slate-500">
            {copy.telegramDidNotOpen}
          </p>
          <p className="select-all break-all rounded-2xl bg-white p-3.5 text-center font-mono text-xs text-slate-700 ring-1 ring-slate-900/5">
            {link}
          </p>
          <p className="text-center text-xs text-slate-500">
            {copy.telegramLinkExpiresIn}
          </p>
          <button
            type="button"
            className={portalGhostButton}
            disabled={pending}
            onClick={() => connect(true)}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {copy.telegramNewLink}
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-2xl bg-red-50 p-3.5 text-sm text-red-700 ring-1 ring-red-200"
        >
          {error}
        </p>
      )}
    </div>
  );
}
