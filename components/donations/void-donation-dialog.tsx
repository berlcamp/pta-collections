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
import { voidDonationSchema } from "@/lib/validations/donations";
import { voidDonation } from "@/app/actions/donations";

const formSchema = voidDonationSchema.pick({ reason: true });
type VoidValues = z.infer<typeof formSchema>;

export function VoidDonationDialog({
  donationId,
  acknowledgementNumber,
}: {
  donationId: string;
  acknowledgementNumber: string;
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
      const result = await voidDonation({ donationId, reason: values.reason });
      if (!result.ok) {
        form.setError("reason", { message: result.error });
        return;
      }
      toast.success(`${acknowledgementNumber} voided.`);
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
          <DialogTitle>Void {acknowledgementNumber}?</DialogTitle>
          <DialogDescription>
            This cannot be undone. The donation is preserved as history, it stops
            counting towards the program total, and the acknowledgement number is
            never reissued. To correct a mistake, void this and record a new one.
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
                      placeholder="Duplicate entry, wrong program, incorrect amount…"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Written to the audit log and shown on the acknowledgement.
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
                Void donation
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
