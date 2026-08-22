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
import { schoolSchema } from "@/lib/validations/admin";
import { createSchool } from "@/app/actions/admin";

type SchoolValues = z.infer<typeof schoolSchema>;

export function NewSchoolForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<SchoolValues>({
    resolver: zodResolver(schoolSchema),
    mode: "onTouched",
    defaultValues: {
      school_code: "",
      name: "",
      receipt_prefix: "",
      short_name: "",
      address: "",
      city: "",
      province: "",
      region: "",
      contact_number: "",
      email: "",
    },
  });

  const prefix = form.watch("receipt_prefix");

  function onSubmit(values: SchoolValues) {
    startTransition(async () => {
      // Empty optional text is stored as NULL, never "": a blank string in a
      // nullable column defeats every `IS NULL` check downstream.
      const blankToNull = (v: string | null | undefined) => v?.trim() || null;

      const res = await createSchool({
        ...values,
        short_name: blankToNull(values.short_name),
        address: blankToNull(values.address),
        city: blankToNull(values.city),
        province: blankToNull(values.province),
        region: blankToNull(values.region),
        contact_number: blankToNull(values.contact_number),
        email: blankToNull(values.email),
      });

      if (!res.ok) {
        // A duplicate code is the one failure only the database can detect.
        form.setError(
          /code/i.test(res.error) ? "school_code" : "name",
          { message: res.error },
        );
        return;
      }
      toast.success("School created. Now assign an administrator.");
      router.push(`/super/schools/${res.data.schoolId}`);
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
            <CardTitle>Identity</CardTitle>
            <CardDescription>
              The code and receipt prefix are permanent fixtures of every receipt
              this school ever issues.
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
                    <Input
                      placeholder="Ozamiz National High School"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="school_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    School code <RequiredMark />
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ONHS"
                      className="font-mono uppercase"
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value.toUpperCase())
                      }
                    />
                  </FormControl>
                  <FormDescription>Unique across all schools.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                      placeholder="ONHS"
                      className="font-mono uppercase"
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value.toUpperCase())
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    Receipts read{" "}
                    <span className="font-mono">
                      {prefix || "ONHS"}-2026-000001
                    </span>
                    .
                  </FormDescription>
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
                      placeholder="09171234567"
                      className="font-mono"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Location and contact</CardTitle>
            <CardDescription>
              Printed in the header of every receipt and report.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
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
                  <FormLabel>City / Municipality</FormLabel>
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
                    <Input
                      placeholder="Region X"
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>School email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Create school
          </Button>
        </div>
      </form>
    </Form>
  );
}
