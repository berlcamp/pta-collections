import { createClient } from "@/lib/supabase/server";
import type {
  Donation,
  DonationProgram,
  Donor,
  DonorTotals,
  PledgeStatusRow,
  ProgramTotals,
  School,
  SchoolYear,
} from "@/types/database.types";

/**
 * Donation reads.
 *
 * As in lib/data/hydrate.ts: anything sourced from a VIEW looks its names up
 * with a second explicit query rather than a PostgREST embed. Embedding through
 * a view fails by returning nulls instead of erroring, which is the worst of
 * both worlds on a page that prints money figures.
 */

export async function getPrograms(
  schoolId: string,
  schoolYearId: string,
): Promise<DonationProgram[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("donation_programs")
    .select("*")
    .eq("school_id", schoolId)
    .eq("school_year_id", schoolYearId)
    .order("status")
    .order("name");
  return (data ?? []) as DonationProgram[];
}

/** Programs currently accepting money. What the "record a donation" form lists. */
export async function getOpenPrograms(
  schoolId: string,
  schoolYearId: string,
): Promise<DonationProgram[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("donation_programs")
    .select("*")
    .eq("school_id", schoolId)
    .eq("school_year_id", schoolYearId)
    .eq("status", "open")
    .order("name");
  return (data ?? []) as DonationProgram[];
}

export async function getProgramTotals(
  schoolId: string,
  schoolYearId: string,
): Promise<ProgramTotals[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_donation_program_totals")
    .select("*")
    .eq("school_id", schoolId)
    .eq("school_year_id", schoolYearId)
    .order("total_received", { ascending: false });
  return ((data ?? []) as ProgramTotals[]).map(normalizeTotals);
}

export async function getProgramTotal(
  programId: string,
): Promise<ProgramTotals | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_donation_program_totals")
    .select("*")
    .eq("program_id", programId)
    .maybeSingle<ProgramTotals>();
  return data ? normalizeTotals(data) : null;
}

/** numeric(12,2) arrives from PostgREST as a string often enough to matter. */
function normalizeTotals(r: ProgramTotals): ProgramTotals {
  return {
    ...r,
    target_amount: r.target_amount === null ? null : Number(r.target_amount),
    cash_received: Number(r.cash_received),
    in_kind_value: Number(r.in_kind_value),
    total_received: Number(r.total_received),
    donation_count: Number(r.donation_count),
    donor_count: Number(r.donor_count),
    pledged_total: Number(r.pledged_total),
    pledge_outstanding: Number(r.pledge_outstanding),
    progress_pct: r.progress_pct === null ? null : Number(r.progress_pct),
  };
}

export async function getPledges(
  schoolId: string,
  schoolYearId: string,
  opts: { programId?: string; openOnly?: boolean } = {},
): Promise<PledgeStatusRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("v_donation_pledge_status")
    .select("*")
    .eq("school_id", schoolId)
    .eq("school_year_id", schoolYearId);

  if (opts.programId) q = q.eq("program_id", opts.programId);
  if (opts.openOnly) q = q.eq("status", "open");

  const { data } = await q.order("due_date", { nullsFirst: false });

  return ((data ?? []) as PledgeStatusRow[]).map((p) => ({
    ...p,
    pledged_amount: Number(p.pledged_amount),
    fulfilled_amount: Number(p.fulfilled_amount),
    fulfilled_cash: Number(p.fulfilled_cash),
    fulfilled_in_kind: Number(p.fulfilled_in_kind),
    remaining_amount: Number(p.remaining_amount),
  }));
}

export async function getDonorTotals(
  schoolId: string,
  schoolYearId: string,
  limit = 100,
): Promise<DonorTotals[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_donor_totals")
    .select("*")
    .eq("school_id", schoolId)
    .eq("school_year_id", schoolYearId)
    .order("total_given", { ascending: false })
    .limit(limit);

  return ((data ?? []) as DonorTotals[]).map((d) => ({
    ...d,
    cash_given: Number(d.cash_given),
    in_kind_given: Number(d.in_kind_given),
    total_given: Number(d.total_given),
    donation_count: Number(d.donation_count),
    program_count: Number(d.program_count),
  }));
}

/**
 * Display names for a set of donations, in two batched lookups.
 * Anonymous donations have no donor_id and are simply absent from the map —
 * callers render "Anonymous" rather than looking for a name that is not there.
 */
export interface DonationNameLookup {
  donors: Map<string, { display_name: string; donor_type: string }>;
  programs: Map<string, string>;
  profiles: Map<string, string>;
}

export async function lookupDonationNames(
  donorIds: (string | null)[],
  programIds: string[],
  profileIds: string[],
): Promise<DonationNameLookup> {
  const supabase = await createClient();
  const donors = [...new Set(donorIds)].filter((v): v is string => Boolean(v));
  const programs = [...new Set(programIds)].filter(Boolean);
  const profiles = [...new Set(profileIds)].filter(Boolean);

  const [donorRes, programRes, profileRes] = await Promise.all([
    donors.length
      ? supabase.from("donors").select("id, display_name, donor_type").in("id", donors)
      : Promise.resolve({ data: [] }),
    programs.length
      ? supabase.from("donation_programs").select("id, name").in("id", programs)
      : Promise.resolve({ data: [] }),
    profiles.length
      ? supabase.from("profiles").select("id, full_name").in("id", profiles)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    donors: new Map(
      ((donorRes.data ?? []) as { id: string; display_name: string; donor_type: string }[]).map(
        (d) => [d.id, { display_name: d.display_name, donor_type: d.donor_type }],
      ),
    ),
    programs: new Map(
      ((programRes.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]),
    ),
    profiles: new Map(
      ((profileRes.data ?? []) as { id: string; full_name: string }[]).map((p) => [
        p.id,
        p.full_name,
      ]),
    ),
  };
}

export async function searchDonors(
  schoolId: string,
  term: string,
  limit = 8,
): Promise<Donor[]> {
  const supabase = await createClient();
  const escaped = term.replace(/[%,()]/g, " ");
  const { data } = await supabase
    .from("donors")
    .select("*")
    .eq("school_id", schoolId)
    .eq("active", true)
    .ilike("display_name", `%${escaped}%`)
    .order("display_name")
    .limit(limit);
  return (data ?? []) as Donor[];
}

/* -------------------------------------------------------------------------- */
/*  The printable acknowledgement                                             */
/* -------------------------------------------------------------------------- */

export interface AcknowledgementData {
  donation: Donation;
  school: School;
  schoolYear: SchoolYear;
  program: DonationProgram;
  /** Null for an anonymous donation. */
  donor: Donor | null;
  receiver: { full_name: string } | null;
  /** Set when this donation redeemed a pledge, for the "balance of pledge" line. */
  pledge: PledgeStatusRow | null;
}

export async function getAcknowledgementData(
  donationId: string,
): Promise<AcknowledgementData | null> {
  const supabase = await createClient();

  const { data: donation } = await supabase
    .from("donations")
    .select("*")
    .eq("id", donationId)
    .maybeSingle<Donation>();

  if (!donation) return null;

  const [schoolRes, yearRes, programRes, donorRes, receiverRes, pledgeRes] =
    await Promise.all([
      supabase.from("schools").select("*").eq("id", donation.school_id).single(),
      supabase.from("school_years").select("*").eq("id", donation.school_year_id).single(),
      supabase.from("donation_programs").select("*").eq("id", donation.program_id).single(),
      donation.donor_id
        ? supabase.from("donors").select("*").eq("id", donation.donor_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", donation.received_by)
        .maybeSingle(),
      donation.pledge_id
        ? supabase
            .from("v_donation_pledge_status")
            .select("*")
            .eq("id", donation.pledge_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  return {
    donation: { ...donation, amount: Number(donation.amount) },
    school: schoolRes.data as School,
    schoolYear: yearRes.data as SchoolYear,
    program: programRes.data as DonationProgram,
    donor: (donorRes.data ?? null) as Donor | null,
    receiver: (receiverRes.data ?? null) as { full_name: string } | null,
    pledge: (pledgeRes.data ?? null) as PledgeStatusRow | null,
  };
}
