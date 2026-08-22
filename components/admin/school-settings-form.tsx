"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { schoolSettingsSchema } from "@/lib/validations/admin";
import { saveSchoolSettings } from "@/app/actions/admin";
import type { School } from "@/types/database.types";

type SettingsValues = z.infer<typeof schoolSettingsSchema>;

export function SchoolSettingsForm({ school }: { school: School }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<SettingsValues>({
    resolver: zodResolver(schoolSettingsSchema),
    mode: "onTouched",
    defaultValues: {
      name: school.name,
      short_name: school.short_name ?? "",
      address: school.address ?? "",
      city: school.city ?? "",
      province: school.province ?? "",
      region: school.region ?? "",
      contact_number: school.contact_number ?? "",
      email: school.email ?? "",
      receipt_prefix: school.receipt_prefix,
      receipt_footer_text: school.receipt_footer_text ?? "",
      timezone: school.timezone,
    },
  });

  const prefix = form.watch("receipt_prefix");
  const dirty = form.formState.isDirty;

  function onSubmit(values: SettingsValues) {
    startTransition(async () => {
      const res = await saveSchoolSettings(values);
      if (!res.ok) {
        form.setError("root", { message: res.error });
        return;
      }
      toast.success("Settings saved.");
      // Re-baseline the dirty check against what was just persisted.
      form.reset(values);
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="max-w-2xl space-y-4"
      >
        <Card>
          <CardHeader>
            <CardTitle>School identity</CardTitle>
            <CardDescription>
              Printed at the head of every receipt and report.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>
                    School name <RequiredMark />
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
              name="short_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Short name</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contact_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact number</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="tel"
                      className="font-mono"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="province"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Province</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="region"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Region</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
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
                    <Input type="email" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receipts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="receipt_prefix"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Receipt prefix <RequiredMark />
                  </FormLabel>
                  <FormControl>
                    <Input
                      className="w-40 font-mono uppercase"
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value.toUpperCase())
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    Receipts read{" "}
                    <span className="font-mono">
                      {prefix || "PREFIX"}-2026-000001
                    </span>
                    . Numbering restarts each school year and is unique within
                    this school only. Gaps are normal — a number is consumed even
                    if the transaction rolls back, and a voided number is never
                    reissued.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="receipt_footer_text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Receipt footer</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Thank you for supporting our PTA."
                      className="resize-none"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Timezone <RequiredMark />
                  </FormLabel>
                  <FormControl>
                    <Input className="w-56 font-mono" {...field} />
                  </FormControl>
                  <FormDescription>
                    Defines the day boundary for daily collections and every
                    report. Changing it shifts which day a payment is counted in.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {form.formState.errors.root && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          >
            {form.formState.errors.root.message}
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          {dirty && (
            <p className="text-sm text-muted-foreground">Unsaved changes</p>
          )}
          <Button type="submit" disabled={pending || !dirty}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save settings
          </Button>
        </div>
      </form>
    </Form>
  );
}
