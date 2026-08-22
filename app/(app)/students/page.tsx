import Link from "next/link";
import { GraduationCap, Plus, Upload } from "lucide-react";
import { requireSchool } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import {
  getGradeLevels,
  getSchoolYears,
  resolveSchoolYear,
} from "@/lib/data/school";
import { searchStudents } from "@/lib/data/students";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ServerPagination } from "@/components/common/server-pagination";
import { SchoolYearPicker } from "@/components/common/school-year-picker";
import { StudentFilters } from "@/components/students/student-filters";
import { StudentsTable } from "@/components/tables/students-table";
import { Button } from "@/components/ui/button";
import { formatNameListing } from "@/lib/utils/names";
import type { StudentStatus } from "@/types/database.types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    sy?: string;
    q?: string;
    grade?: string;
    page?: string;
  }>;
}) {
  const ctx = await requireSchool();
  const { sy, q, grade, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1));

  const [schoolYear, schoolYears] = await Promise.all([
    resolveSchoolYear(ctx.activeSchool.id, sy),
    getSchoolYears(ctx.activeSchool.id),
  ]);

  if (!schoolYear) {
    return (
      <>
        <PageHeader title="Students" />
        <EmptyState
          icon={GraduationCap}
          title="No school year yet"
          description="Create a school year before adding students."
          action={
            can(ctx.activeRole, "manageSchoolYears") ? (
              <Button asChild>
                <Link href="/admin/school-years">Create a school year</Link>
              </Button>
            ) : undefined
          }
        />
      </>
    );
  }

  const [{ rows, total }, gradeLevels] = await Promise.all([
    searchStudents({
      schoolId: ctx.activeSchool.id,
      schoolYearId: schoolYear.id,
      query: q,
      gradeLevel: grade,
      page,
      pageSize: PAGE_SIZE,
    }),
    getGradeLevels(),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Students"
        description={`${total.toLocaleString()} enrolled · ${schoolYear.name}`}
        actions={
          <>
            <SchoolYearPicker years={schoolYears} current={schoolYear.id} />
            {can(ctx.activeRole, "importStudents") && (
              <Button variant="outline" asChild>
                <Link href="/students/import">
                  <Upload className="size-4" />
                  Import
                </Link>
              </Button>
            )}
            {can(ctx.activeRole, "manageStudents") && (
              <Button asChild>
                <Link href="/students/new">
                  <Plus className="size-4" />
                  Add student
                </Link>
              </Button>
            )}
          </>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={q || grade ? "No matching students" : "No students yet"}
          description={
            q || grade
              ? "Nothing matches the current filters. Clear them to see the whole roll."
              : "Import a CSV or add students manually to get started."
          }
        />
      ) : (
        <div className="space-y-4">
          <StudentsTable
            filters={<StudentFilters gradeLevels={gradeLevels.map((g) => g.code)} />}
            rows={rows.map((s) => ({
              student_id: s.student_id,
              name: formatNameListing(s),
              student_number: s.student_number,
              grade_level: s.grade_level,
              section_name: s.section_name,
              outstanding: Number(s.outstanding),
              student_status: s.student_status as StudentStatus,
            }))}
          />
          <ServerPagination
            page={page}
            pages={pages}
            total={total}
            pageSize={PAGE_SIZE}
            noun="student"
          />
        </div>
      )}
    </>
  );
}
