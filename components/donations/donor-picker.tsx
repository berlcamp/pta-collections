"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, Search, UserRound, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/browser";
import type { DonorType } from "@/types/database.types";

/**
 * Who is giving.
 *
 * A donation may come from a parent already on file, from a donor who has given
 * before, or from someone the school has never seen. The picker searches the
 * first two and falls back to typing the third, because a cashier with a queue
 * cannot be sent to a separate "add donor" screen mid-transaction.
 *
 * The two searches are deliberately separate lists rather than one merged one:
 * picking a GUARDIAN links the resulting donor row back to the guardian record,
 * so the family's giving and their child's fees stay connected. Picking a plain
 * donor does not. Merging them would hide which of those two things happened.
 */

export interface NewDonorInput {
  display_name: string;
  donor_type: DonorType;
  guardian_id: string | null;
  contact_number: string | null;
  email: string | null;
  address: string | null;
}

export type DonorSelection =
  | { kind: "existing"; donorId: string; label: string }
  | { kind: "new"; donor: NewDonorInput }
  | null;

const DONOR_TYPES: { value: DonorType; label: string }[] = [
  { value: "guardian", label: "Parent / guardian" },
  { value: "alumnus", label: "Alumnus" },
  { value: "staff", label: "School staff" },
  { value: "business", label: "Business" },
  { value: "government", label: "Government / barangay" },
  { value: "organization", label: "Organization" },
  { value: "other", label: "Other" },
];

interface DonorHit {
  id: string;
  display_name: string;
  donor_type: DonorType;
  contact_number: string | null;
}

interface GuardianHit {
  id: string;
  first_name: string;
  last_name: string;
  contact_number: string | null;
}

export function DonorPicker({
  schoolId,
  value,
  onChange,
  disabled,
  idPrefix = "donor",
}: {
  schoolId: string;
  value: DonorSelection;
  onChange: (next: DonorSelection) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const [query, setQuery] = useState("");
  const [donors, setDonors] = useState<DonorHit[]>([]);
  const [guardians, setGuardians] = useState<GuardianHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<NewDonorInput>({
    display_name: "",
    donor_type: "other",
    guardian_id: null,
    contact_number: null,
    email: null,
    address: null,
  });

  const term = query.trim();
  const showHits = !value && !creating && term.length >= 2;

  // Derived, not stored — the same shape penalty-dialog uses. Clearing the hit
  // arrays inside the effect would be a synchronous setState in an effect body,
  // which cascades an extra render on every keystroke.
  const visibleDonors = showHits ? donors : [];
  const visibleGuardians = showHits ? guardians : [];

  useEffect(() => {
    if (!showHits) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      const escaped = term.replace(/[%,()]/g, " ");
      const [donorRes, guardianRes] = await Promise.all([
        supabase
          .from("donors")
          .select("id, display_name, donor_type, contact_number")
          .eq("school_id", schoolId)
          .eq("active", true)
          .ilike("display_name", `%${escaped}%`)
          .order("display_name")
          .limit(6),
        supabase
          .from("parents_guardians")
          .select("id, first_name, last_name, contact_number")
          .eq("school_id", schoolId)
          .or(`first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%`)
          .limit(6),
      ]);
      if (cancelled) return;
      setDonors((donorRes.data ?? []) as DonorHit[]);
      setGuardians((guardianRes.data ?? []) as GuardianHit[]);
      setSearching(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term, showHits, schoolId]);

  function pickDonor(d: DonorHit) {
    onChange({ kind: "existing", donorId: d.id, label: d.display_name });
    setQuery("");
  }

  function pickGuardian(g: GuardianHit) {
    // A guardian-linked donor is created by the RPC on first donation, and
    // reused on every one after — hence "new" here even for a known parent.
    onChange({
      kind: "new",
      donor: {
        display_name: `${g.first_name} ${g.last_name}`.trim(),
        donor_type: "guardian",
        guardian_id: g.id,
        contact_number: g.contact_number,
        email: null,
        address: null,
      },
    });
    setQuery("");
  }

  function startNew() {
    setCreating(true);
    setDraft({
      display_name: term,
      donor_type: "other",
      guardian_id: null,
      contact_number: null,
      email: null,
      address: null,
    });
  }

  function commitNew(next: NewDonorInput) {
    setDraft(next);
    onChange(
      next.display_name.trim().length >= 2
        ? { kind: "new", donor: { ...next, display_name: next.display_name.trim() } }
        : null,
    );
  }

  function clear() {
    onChange(null);
    setCreating(false);
    setQuery("");
    setDraft({
      display_name: "",
      donor_type: "other",
      guardian_id: null,
      contact_number: null,
      email: null,
      address: null,
    });
  }

  /* ---------------------------------------------------------------------- */

  if (value) {
    const label = value.kind === "existing" ? value.label : value.donor.display_name;
    const isGuardian =
      value.kind === "new" && value.donor.guardian_id !== null;
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{label}</span>
          {isGuardian && (
            <Badge variant="outline" className="shrink-0 text-xs">
              Parent on file
            </Badge>
          )}
          {value.kind === "new" && !isGuardian && (
            <Badge variant="outline" className="shrink-0 text-xs">
              New donor
            </Badge>
          )}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={disabled}
        >
          <X className="size-3.5" />
          Change
        </Button>
      </div>
    );
  }

  if (creating) {
    return (
      <div className="space-y-3 rounded-lg border p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor={`${idPrefix}-name`}
              className="text-sm font-medium"
            >
              Donor name
            </label>
            <Input
              id={`${idPrefix}-name`}
              value={draft.display_name}
              onChange={(e) =>
                commitNew({ ...draft, display_name: e.target.value })
              }
              placeholder="Ozamiz Hardware Supply"
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor={`${idPrefix}-type`}
              className="text-sm font-medium"
            >
              Donor type
            </label>
            <Select
              value={draft.donor_type}
              onValueChange={(v) =>
                commitNew({ ...draft, donor_type: v as DonorType })
              }
              disabled={disabled}
            >
              <SelectTrigger id={`${idPrefix}-type`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DONOR_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor={`${idPrefix}-contact`}
              className="text-sm font-medium"
            >
              Contact number{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <Input
              id={`${idPrefix}-contact`}
              value={draft.contact_number ?? ""}
              onChange={(e) =>
                commitNew({ ...draft, contact_number: e.target.value || null })
              }
              placeholder="09171234567"
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor={`${idPrefix}-email`}
              className="text-sm font-medium"
            >
              Email{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </label>
            <Input
              id={`${idPrefix}-email`}
              value={draft.email ?? ""}
              onChange={(e) =>
                commitNew({ ...draft, email: e.target.value || null })
              }
              disabled={disabled}
            />
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCreating(false)}
          disabled={disabled}
        >
          <Search className="size-3.5" />
          Search instead
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={`${idPrefix}-search`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a parent or a previous donor…"
          className="pl-9"
          disabled={disabled}
          autoComplete="off"
        />
        {searching && (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {(visibleDonors.length > 0 || visibleGuardians.length > 0) && (
        <div className="max-h-52 overflow-y-auto rounded-lg border">
          {visibleDonors.length > 0 && (
            <>
              <p className="bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                Previous donors
              </p>
              {visibleDonors.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => pickDonor(d)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  {d.donor_type === "business" ||
                  d.donor_type === "organization" ||
                  d.donor_type === "government" ? (
                    <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 truncate font-medium">
                    {d.display_name}
                  </span>
                  {d.contact_number && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {d.contact_number}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}

          {visibleGuardians.length > 0 && (
            <>
              <p className="bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                Parents and guardians on file
              </p>
              {visibleGuardians.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => pickGuardian(g)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate font-medium">
                    {g.first_name} {g.last_name}
                  </span>
                  {g.contact_number && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {g.contact_number}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={startNew}
        disabled={disabled}
      >
        <UserRound className="size-3.5" />
        {term.length >= 2 ? `Add "${term}" as a new donor` : "Add a new donor"}
      </Button>
    </div>
  );
}
