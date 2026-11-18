import { CheckCircle2, Users } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getGuardianDuplicates } from "@/lib/data/guardians";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { DuplicatePairCard } from "@/components/students/duplicate-pair-card";

export const dynamic = "force-dynamic";

/**
 * Parents typed in twice. Siblings are one family only when they share a
 * parent RECORD, so every duplicate here is a family the system sees as two:
 * two cards, two portal logins each showing half the children, and — once
 * fees are per family — two charges. This page should read zero.
 */
export default async function ParentsPage() {
  const ctx = await requireRole(["admin"]);
  const pairs = await getGuardianDuplicates(ctx.activeSchool.id);

  return (
    <>
      <PageHeader
        title="Duplicate parents"
        description="The same parent entered more than once. Merge them so siblings count as one family."
      />

      {pairs.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No likely duplicates"
          description="Every parent record looks like a different person."
        />
      ) : (
        <div className="grid max-w-5xl gap-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4" />
            {pairs.length} possible duplicate{pairs.length === 1 ? "" : "s"} — matched on
            the same mobile number or a very similar name. Check the children before
            merging.
          </p>
          {pairs.map((p) => (
            <DuplicatePairCard key={`${p.a.id}:${p.b.id}`} pair={p} />
          ))}
        </div>
      )}
    </>
  );
}
