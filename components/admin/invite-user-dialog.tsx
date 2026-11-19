"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Loader2, UserPlus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";
import { inviteSchema } from "@/lib/validations/admin";
import { inviteUser } from "@/app/actions/admin";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SchoolRole } from "@/types/database.types";

type InviteValues = z.infer<typeof inviteSchema>;

export function InviteUserDialog({
  sections = [],
}: {
  /** This school year's sections, offered when inviting a teacher. */
  sections?: { id: string; name: string; grade_level: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    // Validate once the field has been touched, then live as they correct it —
    // messages never appear while someone is still typing their first attempt.
    mode: "onTouched",
    defaultValues: {
      email: "",
      full_name: "",
      role: "cashier",
      sectionIds: [],
    },
  });

  const role = form.watch("role");
  // Set when the address belongs to someone already in this school with a
  // different role: one membership per school, so inviting replaces it.
  const [confirm, setConfirm] = useState<{
    name: string;
    currentRole: string;
  } | null>(null);

  function onSubmit(values: InviteValues) {
    send(values, false);
  }

  function send(values: InviteValues, confirmRoleChange: boolean) {
    startTransition(async () => {
      const res = await inviteUser({
        ...values,
        sectionIds:
          values.role === "teacher" ? (values.sectionIds ?? []) : undefined,
        confirmRoleChange,
      });
      if (!res.ok && res.confirm) {
        setConfirm(res.confirm);
        return;
      }
      setConfirm(null);
      if (!res.ok) {
        // The server re-validates independently; surface its verdict on the
        // field it belongs to rather than as an anonymous toast.
        form.setError("email", { message: res.error });
        return;
      }
      toast.success(
        confirmRoleChange
          ? `${values.email} is now a ${ROLE_LABELS[values.role]}.`
          : `${values.email} invited as ${ROLE_LABELS[values.role]}.`,
      );
      setOpen(false);
      form.reset();
      router.refresh();
    });
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) form.reset();
        }}
      >
        <DialogTrigger asChild>
          <Button>
            <UserPlus className="size-4" />
            Invite user
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a user</DialogTitle>
            <DialogDescription>
              They sign in with Google using this exact address. There are no
              passwords in this system.
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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Google account email <RequiredMark />
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="off"
                        placeholder="cashier@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Full name <RequiredMark />
                    </FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(Object.keys(ROLE_LABELS) as SchoolRole[]).map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>{ROLE_DESCRIPTIONS[role]}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {role === "teacher" && (
                <FormField
                  control={form.control}
                  name="sectionIds"
                  render={({ field }) => {
                    const value = field.value ?? [];
                    const grades = [
                      ...new Set(sections.map((s) => s.grade_level)),
                    ];
                    return (
                      <FormItem>
                        <FormLabel>Sections</FormLabel>
                        {sections.length === 0 ? (
                          <FormDescription>
                            This school year has no sections yet. Add them under
                            Administration → Sections, then assign the teacher
                            there.
                          </FormDescription>
                        ) : (
                          <>
                            <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border p-3">
                              {grades.map((g) => (
                                <div key={g}>
                                  <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                    {g}
                                  </p>
                                  <div className="grid gap-1 sm:grid-cols-2">
                                    {sections
                                      .filter((s) => s.grade_level === g)
                                      .map((s) => (
                                        <label
                                          key={s.id}
                                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                                        >
                                          <Checkbox
                                            checked={value.includes(s.id)}
                                            onCheckedChange={(v) =>
                                              field.onChange(
                                                v
                                                  ? [...value, s.id]
                                                  : value.filter(
                                                      (x) => x !== s.id,
                                                    ),
                                              )
                                            }
                                          />
                                          {s.name}
                                        </label>
                                      ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <FormDescription>
                              Applied when they first sign in. You can change it
                              later under Administration → Sections.
                            </FormDescription>
                          </>
                        )}
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              )}

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
                  Send invitation
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(confirm)}
        onOpenChange={(v) => !v && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Change {confirm?.name} to {ROLE_LABELS[role]}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.name} is already a {confirm?.currentRole} at this
              school. A person has one role per school, so this replaces it:
              they will no longer be a {confirm?.currentRole} here. Their roles
              at other schools are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              Keep as {confirm?.currentRole}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                send(form.getValues(), true);
              }}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Change to {ROLE_LABELS[role]}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
