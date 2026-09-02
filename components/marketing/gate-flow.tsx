import { Fragment } from "react";
import { ArrowRight, Database, IdCard, ScanLine, Send } from "lucide-react";

/**
 * The physical chain a single tap travels, as a diagram.
 *
 * It sits above the four steps rather than replacing them: the steps are about
 * what the system GUARANTEES at each stage — tenancy, staleness, the Manila day
 * boundary — and none of that says which box hands off to which. This does, in
 * one glance, and it is the answer to the question a principal asks first.
 *
 * The arrows turn with the layout: a column on small screens points down, the
 * row on large screens points right.
 */

const NODES = [
  {
    icon: IdCard,
    title: "The card",
    body: "One student, one card, bound in the office.",
  },
  {
    icon: ScanLine,
    title: "The reader",
    body: "A small device on the wall by the gate.",
  },
  {
    icon: Database,
    title: "Smart Campus",
    body: "Resolved against the school's own roster.",
  },
  {
    icon: Send,
    title: "Telegram",
    body: "The guardian's phone, seconds later.",
  },
] as const;

export function GateFlow() {
  return (
    <ol className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-0">
      {NODES.map(({ icon: Icon, title, body }, i) => (
        <Fragment key={title}>
          <li className="flex-1 rounded-2xl border border-border bg-background p-5 shadow-sm">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
            <p className="mt-3.5 text-sm font-semibold tracking-tight">
              {title}
            </p>
            <p className="mt-1 text-sm text-pretty text-muted-foreground">
              {body}
            </p>
          </li>

          {i < NODES.length - 1 && (
            <li
              aria-hidden
              className="flex items-center justify-center py-0.5 lg:w-8 lg:py-0"
            >
              <ArrowRight className="size-4 rotate-90 text-muted-foreground/70 lg:rotate-0" />
            </li>
          )}
        </Fragment>
      ))}
    </ol>
  );
}
