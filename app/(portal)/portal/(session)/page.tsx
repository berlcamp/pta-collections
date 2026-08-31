import Link from "next/link";
import { AlertCircle, ChevronRight, ScanLine, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getPortalChildren } from "@/lib/data/portal";
import { peso, t } from "@/lib/portal/i18n";
import { requirePortalSession } from "@/lib/portal/session";

export const dynamic = "force-dynamic";

export default async function PortalHomePage() {
  const session = await requirePortalSession();
  const copy = t(session.locale);
  const children = await getPortalChildren();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{copy.childrenTitle}</h1>

      {children.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {copy.noChildren}
          </CardContent>
        </Card>
      )}

      {children.map((child) => {
        const owes = Number(child.outstanding_balance) > 0;
        return (
          <Card key={child.student_id} className="overflow-hidden">
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{child.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[child.grade_level, child.section_name, child.student_no]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Badge variant={owes ? "destructive" : "secondary"}>
                  {owes ? copy.outstanding : copy.settled}
                </Badge>
              </div>

              <p className="font-mono text-2xl font-semibold tabular-nums">
                {peso(child.outstanding_balance)}
              </p>

              {/* A child who has left stays visible — hiding them generates a
                  support call — but online payment is blocked, because
                  pta.payments carries an FK to student_enrollments and the
                  claim could never be approved. */}
              {!child.is_enrolled && (
                <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-medium">{copy.notEnrolled}</p>
                    <p className="mt-0.5">{copy.notEnrolledHelp}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link
                    href={{
                      pathname: "/portal/attendance",
                      query: { student: child.student_id },
                    }}
                  >
                    <ScanLine className="mr-1.5 size-4" />
                    {copy.viewAttendance}
                  </Link>
                </Button>
                <Button asChild size="sm" className="flex-1">
                  <Link
                    href={{
                      pathname: "/portal/balances",
                      query: { student: child.student_id },
                    }}
                  >
                    <Wallet className="mr-1.5 size-4" />
                    {copy.viewFees}
                    <ChevronRight className="ml-auto size-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
