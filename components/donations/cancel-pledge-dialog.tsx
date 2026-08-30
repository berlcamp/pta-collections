"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, XCircle } from "lucide-react";
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
import { cancelPledgeSchema } from "@/lib/validations/donations";
import { cancelPledge } from "@/app/actions/donations";

const formSchema = cancelPledgeSchema.pick({ reason: true });
type CancelValues = z.infer<typeof formSchema>;

export function CancelPledgeDialog({
  pledgeId,
  donorName,
}: {
  pledgeId: string;
  donorName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<CancelValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: { reason: "" },
  });

  function onSubmit(values: CancelValues) {
    startTransition(async () => {
      const result = await cancelPledge({ pledgeId, reason: values.reason });
      if (!result.ok) {
        form.setError("reason", { message: result.error });
        return;
      }
      toast.success("Pledge cancelled.");
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
        <Button variant="ghost" size="sm">
          <XCircle className="size-3.5" />
          Cancel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this pledge?</DialogTitle>
          <DialogDescription>
            {donorName} stops appearing on the outstanding-pledge list. Anything
            already given against this pledge stays exactly where it is — a
            cancellation withdraws the promise, never the money.
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
                      placeholder="Donor withdrew, recorded in error, family transferred out…"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Written to the audit log.</FormDescription>
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
                Keep pledge
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Cancel pledge
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
