"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Percent } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { formatMoney, parseMoneyInput } from "@/lib/financial/money";
import { waiveCharge } from "@/app/actions/charges";

export function WaiveChargeDialog({
  chargeId,
  feeName,
  amount,
  paid,
  waived,
}: {
  chargeId: string;
  feeName: string;
  amount: number;
  paid: number;
  waived: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const maxWaivable = amount - paid;

  /**
   * The amount arrives as free text so a cashier can type "1,500.00" — the
   * ceiling depends on this charge, so the schema is built per-dialog rather
   * than shared. The server re-checks the same bound; this only spares a round
   * trip and puts the message next to the field.
   */
  const formSchema = z.object({
    amount: z
      .string()
      .refine((v) => parseMoneyInput(v) > 0, "Enter an amount greater than zero.")
      .refine(
        (v) => parseMoneyInput(v) <= maxWaivable,
        `Cannot exceed ${formatMoney(maxWaivable)}.`,
      ),
    reason: z.string().trim().min(3, "A reason is required."),
  });

  type WaiveValues = z.infer<typeof formSchema>;

  const form = useForm<WaiveValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: {
      amount: String(amount - paid - waived),
      reason: "",
    },
  });

  function onSubmit(values: WaiveValues) {
    startTransition(async () => {
      const result = await waiveCharge({
        chargeId,
        amount: parseMoneyInput(values.amount),
        reason: values.reason,
      });
      if (!result.ok) {
        form.setError("amount", { message: result.error });
        return;
      }
      toast.success("Charge waived.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Percent className="size-3.5" />
          Waive
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Waive {feeName}</DialogTitle>
          <DialogDescription>
            Waive all or part of this charge. The charge is {formatMoney(amount)}
            {paid > 0 && ` with ${formatMoney(paid)} already paid`}, so at most{" "}
            {formatMoney(maxWaivable)} can be waived.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Amount to waive <RequiredMark />
                  </FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      className="text-right font-mono tabular-nums"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Reason <RequiredMark />
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Second sibling discount, hardship, board resolution…"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Kept on the charge and written to the audit log.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Waive charge
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
