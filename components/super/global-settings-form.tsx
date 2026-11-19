"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { saveGlobalSettings } from "@/app/actions/global-settings";
import { globalSettingsSchema } from "@/lib/validations/admin";
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
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

type Values = { telegram_bot_username: string };

export function GlobalSettingsForm({ telegramBot }: { telegramBot: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(globalSettingsSchema),
    mode: "onTouched",
    defaultValues: { telegram_bot_username: telegramBot },
  });

  function onSubmit(values: Values) {
    startTransition(async () => {
      const res = await saveGlobalSettings(values);
      if (!res.ok) {
        form.setError("telegram_bot_username", { message: res.error });
        return;
      }
      toast.success("Saved. Every school now uses this bot.");
      form.reset(values);
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="size-4" /> Telegram bot
            </CardTitle>
            <CardDescription>
              One bot serves every school. It is the bot the server sends gate
              notifications from (TELEGRAM_BOT_TOKEN), and each school&apos;s
              parents connect to it from the Parent Portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="telegram_bot_username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bot username</FormLabel>
                  <FormControl>
                    <Input
                      className="w-72 font-mono"
                      placeholder="MySchoolGateBot"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    The handle @BotFather gave you, without the @. It builds the
                    one-tap &ldquo;Connect Telegram&rdquo; link in every
                    school&apos;s portal. Leave it blank and each school falls
                    back to its own old setting, if it had one.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={pending || !form.formState.isDirty}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
