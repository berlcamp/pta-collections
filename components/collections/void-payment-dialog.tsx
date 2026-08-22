"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Ban, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { voidPaymentSchema } from "@/lib/validations/payment";
import { voidPayment } from "@/app/actions/payments";

// The dialog owns only the reason; the payment id comes from its props and is
// never user-editable, so it is not part of the form's shape.
const formSchema = voidPaymentSchema.pick({ reason: true });
type VoidValues = z.infer<typeof formSchema>;

export function VoidPaymentDialog({
  paymentId,
  receiptNumber,
}: {
  paymentId: string;
  receiptNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<VoidValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: { reason: "" },
  });

  function onSubmit(values: VoidValues) {
    startTransition(async () => {
      const result = await voidPayment({ paymentId, reason: values.reason });
      if (!result.ok) {
        form.setError("reason", { message: result.error });
        return;
      }
      toast.success(`${receiptNumber} voided.`);
      setOpen(false);
      form.reset();
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
        <Button variant="destructive" size="sm">
          <Ban className="size-4" />
          Void
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void {receiptNumber}?</DialogTitle>
          <DialogDescription>
            This cannot be undone. The payment is preserved as history, the
            balance is restored, and the receipt number is never reissued. To
            correct a mistake, void this payment and record a new one.
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
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Reason <RequiredMark />
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Wrong student, duplicate entry, incorrect amount…"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Written to the audit log and shown on the receipt.
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
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Void payment
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
