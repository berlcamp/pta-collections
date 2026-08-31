import { Bell, Camera, MessageCircle, Send, ShieldCheck } from "lucide-react";

import { TelegramConnect } from "@/components/portal/telegram-connect";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { getPortalTelegram } from "@/lib/data/portal";
import { t } from "@/lib/portal/i18n";
import { requirePortalSession } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

/**
 * The Telegram guide.
 *
 * This page is the highest-leverage screen in the portal. Linking used to be a
 * school-office errand — someone prints an enrolment slip, hands it over, and a
 * third of them die in a bag; the Edge Function's own comment budgets for ~70%
 * completion. Doing it from a portal the parent is already signed into, on the
 * phone that already has Telegram, is what turns a monthly-login web app into a
 * daily notification they actually feel.
 *
 * Deliberately absent from the copy: the words "token", "chat ID", "bot API",
 * "deep link" and "enrolment". A parent is being asked to press one button.
 */
export default async function PortalTelegramPage() {
  const session = await requirePortalSession();
  const copy = t(session.locale);
  const status = await getPortalTelegram();

  if (!status) return null;

  const steps = [
    {
      icon: Send,
      title:
        session.locale === "tl"
          ? "Pindutin ang asul na button sa ibaba"
          : "Tap the blue button below",
      body:
        session.locale === "tl"
          ? "Bubuksan nito ang Telegram app sa parehong telepono. Kung wala pa kayong Telegram, i-install muna ito nang libre sa App Store o Play Store."
          : "It opens the Telegram app on this same phone. If you do not have Telegram yet, install it free from the App Store or Play Store first.",
    },
    {
      icon: MessageCircle,
      title:
        session.locale === "tl"
          ? "Pindutin ang START sa Telegram"
          : "Press START in Telegram",
      body:
        session.locale === "tl"
          ? "May lalabas na malaking START button sa ibaba ng screen. Isang pindot lang — walang itatype."
          : "A large START button appears at the bottom of the screen. One tap — there is nothing to type.",
    },
    {
      icon: Camera,
      title:
        session.locale === "tl"
          ? "Balik dito, at tapos na"
          : "Come back here, and you are done",
      body:
        session.locale === "tl"
          ? "Magiging berde ang box sa ibaba. Mula noon, makakatanggap kayo ng mensahe at larawan tuwing dumadaan ang inyong anak sa gate."
          : "The box below turns green. From then on you get a message and a photo every time your child passes the gate.",
    },
  ];

  const faqs = [
    {
      q:
        session.locale === "tl"
          ? "Sabi ng bot, hindi kilala ang link"
          : "The bot says the link was not recognised",
      a:
        session.locale === "tl"
          ? "Nagamit na o expired na ang link. Bumalik dito at pindutin muli ang button para sa bago."
          : "That link was already used, or it has expired. Come back here and press the button again for a fresh one.",
    },
    {
      q:
        session.locale === "tl"
          ? "Hindi nagbukas ang Telegram"
          : "Telegram did not open",
      a:
        session.locale === "tl"
          ? "Malamang hindi pa naka-install ang Telegram sa teleponong ito. I-install ito, gumawa ng account gamit ang inyong numero, at pindutin muli ang button."
          : "Telegram is probably not installed on this phone. Install it, create an account with your mobile number, then press the button again.",
    },
    {
      q:
        session.locale === "tl"
          ? "Ayaw ko na ng mga mensahe"
          : "I do not want the messages any more",
      a:
        session.locale === "tl"
          ? "Patayin ang switch sa itaas, o i-type ang /stop sa chat. Pareho lang ang epekto at maibabalik ninyo ito anumang oras."
          : "Turn the switch above off, or type /stop in the chat. Either works, and you can turn it back on any time.",
    },
    {
      q:
        session.locale === "tl"
          ? "Bakit hindi pangalan ko ang nakikita ko?"
          : "The connected account is not mine",
      a:
        session.locale === "tl"
          ? "Baka naipasa ang link sa iba. Pindutin ang Idiskonekta sa itaas — titigil agad ang mga mensahe — tapos kumonekta muli."
          : "The link may have been forwarded to someone else. Press Disconnect above — the messages stop immediately — then connect again.",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {copy.telegramTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{copy.telegramLead}</p>
      </div>

      {!status.is_linked && (
        <ol className="space-y-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title} className="flex gap-3">
                <div className="relative flex flex-col items-center">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  {index < steps.length - 1 && (
                    <span aria-hidden className="mt-1 w-px flex-1 bg-border" />
                  )}
                </div>
                <div className="pb-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Icon className="size-4 text-muted-foreground" />
                    {step.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <TelegramConnect status={status} locale={session.locale} />

      <Card className="border-dashed">
        <CardContent className="flex gap-3 p-4">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {session.locale === "tl"
              ? "Ang paaralan lang ang nagpapadala ng mensaheng ito. Hindi kayo mapapadalhan ng bot ng kahit anong iba, at hindi nakikita ng ibang magulang ang inyong chat."
              : "Only the school sends these messages. The bot cannot send you anything else, and no other parent can see your chat."}
          </p>
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Bell className="size-3.5" />
          {session.locale === "tl" ? "Kung may problema" : "If something goes wrong"}
        </h2>
        <Card>
          <CardContent className="divide-y p-0">
            {faqs.map((faq) => (
              <Collapsible key={faq.q}>
                <CollapsibleTrigger className="w-full px-4 py-3 text-left text-sm font-medium hover:bg-accent/50">
                  {faq.q}
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 pb-3 text-sm leading-relaxed text-muted-foreground">
                  {faq.a}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
