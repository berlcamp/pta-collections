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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { t } from "@/lib/portal/i18n";
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

  function connect() {
    setError(null);
    startTransition(async () => {
      const result = await issueTelegramLink();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.data.deepLink) {
        setError(copy.telegramNoBot);
        return;
      }

      setLink(result.data.deepLink);
      setWaiting(true);
      // Opened rather than navigated: the portal tab stays put, so the "did it
      // work?" block is still there when they switch back.
      window.open(result.data.deepLink, "_blank", "noopener");
    });
  }

  if (status.is_linked) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{copy.telegramLinked}</p>
            <p className="text-xs text-muted-foreground">
              {status.notifying_children} / {status.total_children}
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-xl border p-4">
          <span className="text-sm font-medium">{copy.telegramNotifications}</span>
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

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await unlinkTelegram();
              toast.success(copy.telegramUnlinked);
              router.refresh();
            })
          }
        >
          <Unlink className="mr-1.5 size-4" />
          {copy.telegramUnlink}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        size="lg"
        className="h-12 w-full text-base"
        disabled={pending || !status.bot_username}
        onClick={connect}
      >
        {pending ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <ExternalLink className="mr-2 size-4" />
        )}
        {copy.telegramConnect}
      </Button>

      {!status.bot_username && (
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {copy.telegramNoBot}
        </p>
      )}

      {waiting && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
          <p className="flex-1 text-sm">{copy.telegramWaiting}</p>
          <Button variant="ghost" size="icon" onClick={() => router.refresh()}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      )}

      {/* The link is offered as text too, for the parent reading this on a
          laptop with Telegram on a different device. */}
      {link && !waiting && (
        <p className="break-all rounded-lg bg-muted p-3 text-center font-mono text-xs">
          {link}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
