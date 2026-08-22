"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/browser";

const formSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(6, "Passwords are at least 6 characters."),
});

type DevLoginValues = z.infer<typeof formSchema>;

/**
 * Rendered only when lib/dev-login.ts says both gates pass. See that file.
 */
export function DevLoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm<DevLoginValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: { email: "berlcamp@gmail.com", password: "localdev12345" },
  });

  async function onSubmit(values: DevLoginValues) {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(values);

    if (error) {
      form.setError("password", { message: error.message });
      setLoading(false);
      return;
    }

    // The OAuth callback normally does this; the password path must too.
    await supabase.rpc("claim_invite");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mt-6">
      <div className="relative">
        <Separator />
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-card px-2 text-[0.7rem] tracking-wide text-muted-foreground uppercase">
          Local development
        </span>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <p className="text-xs leading-snug text-muted-foreground">
          Password sign-in exists only against local Supabase. Production is
          Google-only and has no passwords.
        </p>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="mt-4 space-y-3"
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="username" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={loading}
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            Sign in locally
          </Button>
        </form>
      </Form>
    </div>
  );
}
