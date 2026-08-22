import { createClient } from "@/lib/supabase/server";
import type {
  Payment,
  School,
  SchoolYear,
  Section,
  Student,
  StudentEnrollment,
} from "@/types/database.types";

export interface ReceiptData {
  payment: Payment;
  school: School;
  schoolYear: SchoolYear;
  student: Student;
  enrollment: (StudentEnrollment & { section: Section | null }) | null;
  guardian: { name: string; contact: string | null } | null;
  cashier: { full_name: string } | null;
  items: { id: string; amount: number; fee_type_name: string; description: string | null }[];
  /** The student's remaining balance for the year, after this payment. */
  remainingBalance: number;
}

export async function getReceiptData(
  paymentId: string,
): Promise<ReceiptData | null> {
  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle<Payment>();

  if (!payment) return null;

  const [schoolRes, yearRes, studentRes, enrollRes, itemsRes, cashierRes, finRes, guardianRes] =
    await Promise.all([
      supabase.from("schools").select("*").eq("id", payment.school_id).single(),
      supabase.from("school_years").select("*").eq("id", payment.school_year_id).single(),
      supabase.from("students").select("*").eq("id", payment.student_id).single(),
      supabase
        .from("student_enrollments")
        .select("*, section:sections(*)")
        .eq("student_id", payment.student_id)
        .eq("school_year_id", payment.school_year_id)
        .maybeSingle(),
      supabase
        .from("payment_items")
        .select("id, amount, charge:student_charges(description, fee_type:fee_types(name))")
        .eq("payment_id", paymentId),
      supabase.from("profiles").select("full_name").eq("id", payment.collected_by).maybeSingle(),
      supabase
        .from("v_student_financials")
        .select("outstanding")
        .eq("student_id", payment.student_id)
        .eq("school_year_id", payment.school_year_id)
        .maybeSingle(),
      supabase
        .from("student_guardians")
        .select("guardian:parents_guardians(first_name,last_name,contact_number)")
        .eq("student_id", payment.student_id)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  type RawItem = {
    id: string;
    amount: number;
    charge: {
      description: string | null;
      fee_type: { name: string } | null;
    } | null;
  };

  const items = ((itemsRes.data ?? []) as unknown as RawItem[]).map((i) => ({
    id: i.id,
    amount: Number(i.amount),
    fee_type_name: i.charge?.fee_type?.name ?? "Charge",
    description: i.charge?.description ?? null,
  }));

  const rawGuardian = (guardianRes.data ?? null) as unknown as {
    guardian: { first_name: string; last_name: string; contact_number: string | null } | null;
  } | null;

  return {
    payment,
    school: schoolRes.data as School,
    schoolYear: yearRes.data as SchoolYear,
    student: studentRes.data as Student,
    enrollment: (enrollRes.data ?? null) as ReceiptData["enrollment"],
    guardian: rawGuardian?.guardian
      ? {
          name: `${rawGuardian.guardian.first_name} ${rawGuardian.guardian.last_name}`,
          contact: rawGuardian.guardian.contact_number,
        }
      : null,
    cashier: (cashierRes.data ?? null) as { full_name: string } | null,
    items,
    remainingBalance: Number(
      (finRes.data as { outstanding: number } | null)?.outstanding ?? 0,
    ),
  };
}
