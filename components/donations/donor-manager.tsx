"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  RequiredMark,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DonorsTable, type DonorRow } from "@/components/tables/donors-table";
import { saveDonor } from "@/app/actions/donations";
import type { Donor, DonorType } from "@/types/database.types";

const TYPES: { value: DonorType; label: string }[] = [
  { value: "guardian", label: "Parent / guardian" },
  { value: "alumnus", label: "Alumnus" },
  { value: "staff", label: "School staff" },
  { value: "business", label: "Business" },
  { value: "government", label: "Government / barangay" },
  { value: "organization", label: "Organization" },
  { value: "other", label: "Other" },
];

const formSchema = z.object({
  display_name: z.string().trim().min(2, "Enter the donor's name.").max(150),
  donor_type: z.enum([
    "guardian",
    "alumnus",
    "staff",
    "business",
    "government",
    "organization",
    "other",
  ]),
  contact_number: z.string().trim().max(40),
  email: z.string().trim().max(160),
  address: z.string().trim().max(300),
  notes: z.string().trim().max(1000),
  active: z.boolean(),
});

type DonorValues = z.infer<typeof formSchema>;

export function DonorManager({
  rows,
  timezone,
  canManage,
}: {
  rows: DonorRow[];
  timezone: string;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<Donor | null>(null);

  return (
    <>
      <DonorsTable
        rows={rows}
        timezone={timezone}
        onEdit={canManage ? setEditing : undefined}
      />
      <DonorDialog
        donor={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </>
  );
}

function DonorDialog({
  donor,
  onOpenChange,
}: {
  donor: Donor | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<DonorValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: defaultsFor(donor),
  });

  const [seeded, setSeeded] = useState<string | null>(null);
  const seed = donor?.id ?? null;
  if (seed !== seeded) {
    setSeeded(seed);
    if (donor) form.reset(defaultsFor(donor));
  }

  function onSubmit(values: DonorValues) {
    if (!donor) return;
    startTransition(async () => {
      const result = await saveDonor({
        id: donor.id,
        display_name: values.display_name,
        donor_type: values.donor_type,
        contact_number: values.contact_number || null,
        email: values.email || null,
        address: values.address || null,
        notes: values.notes || null,
        active: values.active,
      });
      if (!result.ok) {
        form.setError("display_name", { message: result.error });
        return;
      }
      toast.success("Donor updated.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={donor !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit donor</DialogTitle>
          <DialogDescription>
            Corrections here apply everywhere this donor appears, including on
            acknowledgements already printed. The donations themselves are
            untouched.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="flex min-h-0 flex-1 flex-col gap-4"
          >
            <div className="-mx-1 min-w-0 flex-1 space-y-4 overflow-y-auto px-1">
              <FormField
                control={form.control}
                name="display_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Name <RequiredMark />
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="donor_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="contact_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact number</FormLabel>
                      <FormControl>
                        <Input placeholder="09171234567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea rows={2} className="resize-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        An inactive donor stops appearing in the search when
                        recording a donation. Their history is kept.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function defaultsFor(donor: Donor | null): DonorValues {
  return {
    display_name: donor?.display_name ?? "",
    donor_type: donor?.donor_type ?? "other",
    contact_number: donor?.contact_number ?? "",
    email: donor?.email ?? "",
    address: donor?.address ?? "",
    notes: donor?.notes ?? "",
    active: donor?.active ?? true,
  };
}
