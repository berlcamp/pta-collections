"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BadgePercent, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { EmptyState } from "@/components/common/empty-state";
import { FeeTypesTable } from "@/components/tables/fee-types-table";
import { parseMoneyInput } from "@/lib/financial/money";
import { saveFeeType } from "@/app/actions/charges";
import type { FeeCategory, FeeType } from "@/types/database.types";

const CATEGORIES: { value: FeeCategory; label: string; hint: string }[] = [
  { value: "annual", label: "Annual", hint: "Assessed to every student each school year" },
  { value: "penalty", label: "Penalty", hint: "Charged to an individual student" },
  { value: "special", label: "Special", hint: "One-off assessment" },
  { value: "other", label: "Other", hint: "Anything else" },
];

/**
 * The amount is free text so a treasurer can type "1,500.00", and blank is a
 * legitimate value meaning "no default". An annual fee, though, is assessed in
 * bulk and cannot be assessed without one — so that combination is rejected
 * here rather than at assessment time, when it is far more confusing.
 */
const formSchema = z
  .object({
    name: z.string().trim().min(2, "Give the fee a name.").max(120),
    category: z.enum(["annual", "penalty", "special", "other"]),
    default_amount: z
      .string()
      .refine(
        (v) => v.trim() === "" || parseMoneyInput(v) >= 0,
        "Enter an amount, or leave it blank for no default.",
      ),
    description: z.string().trim().max(500),
    is_recurring: z.boolean(),
    active: z.boolean(),
  })
  .refine(
    (v) => v.category !== "annual" || v.default_amount.trim() !== "",
    {
      message: "An annual fee needs a default amount before it can be assessed.",
      path: ["default_amount"],
    },
  );

type FeeTypeValues = z.infer<typeof formSchema>;

export function FeeTypeManager({ feeTypes }: { feeTypes: FeeType[] }) {
  const [editing, setEditing] = useState<FeeType | null>(null);
  const [open, setOpen] = useState(false);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(ft: FeeType) {
    setEditing(ft);
    setOpen(true);
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>
          <Plus className="size-4" />
          New fee type
        </Button>
      </div>

      {feeTypes.length === 0 ? (
        <EmptyState
          icon={BadgePercent}
          title="No fee types yet"
          description="Create the PTA annual membership fee, mortuary assistance, and any penalties your school charges."
          action={<Button onClick={openNew}>Create the first fee type</Button>}
        />
      ) : (
        <FeeTypesTable feeTypes={feeTypes} onEdit={openEdit} />
      )}

      <FeeTypeDialog open={open} onOpenChange={setOpen} feeType={editing} />
    </>
  );
}

function defaultsFor(feeType: FeeType | null): FeeTypeValues {
  return {
    name: feeType?.name ?? "",
    category: feeType?.category ?? "annual",
    default_amount:
      feeType?.default_amount != null ? String(feeType.default_amount) : "",
    description: feeType?.description ?? "",
    is_recurring: feeType?.is_recurring ?? false,
    active: feeType?.active ?? true,
  };
}

function FeeTypeDialog({
  open,
  onOpenChange,
  feeType,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  feeType: FeeType | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<FeeTypeValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: defaultsFor(feeType),
  });

  // One dialog serves "new" and every row's "edit", so it re-seeds whenever the
  // row behind it changes — and on every open, or a cancelled draft (values and
  // validation errors alike) would still be sitting there the next time.
  const [seeded, setSeeded] = useState<string | null>(null);
  const seed = open ? (feeType?.id ?? "new") : null;
  if (seed !== seeded) {
    setSeeded(seed);
    if (open) form.reset(defaultsFor(feeType));
  }

  function onSubmit(values: FeeTypeValues) {
    startTransition(async () => {
      const result = await saveFeeType({
        id: feeType?.id,
        name: values.name,
        description: values.description || null,
        category: values.category,
        default_amount: values.default_amount
          ? parseMoneyInput(values.default_amount)
          : null,
        is_recurring: values.is_recurring,
        active: values.active,
      });
      if (!result.ok) {
        form.setError("name", { message: result.error });
        return;
      }
      toast.success(feeType ? "Fee type updated." : "Fee type created.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{feeType ? "Edit fee type" : "New fee type"}</DialogTitle>
          <DialogDescription>
            Fee types are the catalogue every charge is drawn from. Renaming one
            renames it everywhere, including on receipts already issued.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="flex min-h-0 flex-1 flex-col gap-4"
          >
            {/* Only the fields scroll: the footer stays reachable on a short
                viewport, and its edge-to-edge bleed needs to sit outside the
                scroll box. `-mx-1 px-1` gives focus rings room without widening
                the column. */}
            <div className="-mx-1 min-w-0 flex-1 space-y-4 overflow-y-auto px-1">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Name <RequiredMark />
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="PTA Annual Membership" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full min-w-0">
                          {/* Label only. The hint belongs in the list: a
                              SelectItem wraps every child in its ItemText, so
                              leaving it implicit would render the full sentence
                              inside the trigger and force the dialog wider than
                              it can draw. */}
                          <SelectValue>
                            {
                              CATEGORIES.find((c) => c.value === field.value)
                                ?.label
                            }
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                            <span className="text-muted-foreground">
                              {" "}
                              — {c.hint}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="default_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default amount</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="100.00"
                        className="text-right font-mono tabular-nums"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Used when assessing this fee.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Description{" "}
                      <span className="font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Textarea rows={2} className="resize-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_recurring"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Recurring</FormLabel>
                      <FormDescription>
                        Charged again each school year.
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

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Active</FormLabel>
                    <FormDescription>
                      Inactive fee types cannot be assessed or charged.
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
                {feeType ? "Save changes" : "Create fee type"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
