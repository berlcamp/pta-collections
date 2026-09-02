"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange, GraduationCap, Loader2, Pencil, Plus } from "lucide-react";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroller } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { formatDate } from "@/lib/utils/dates";
import { schoolYearSchema } from "@/lib/validations/admin";
import { saveSchoolYear } from "@/app/actions/admin";
import type { SchoolYear } from "@/types/database.types";

// `id` is carried in the dialog's props, not typed by the user, so it is not
// part of the form's shape.
const formSchema = schoolYearSchema.omit({ id: true });
type SchoolYearValues = z.infer<typeof formSchema>;

export function SchoolYearManager({ years }: { years: SchoolYear[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SchoolYear | null>(null);

  return (
    <>
      <div className="mb-4 flex justify-end gap-2">
        {/* Creating a year is inert — it enrolls nobody. This is the step that
            actually populates it, so it lives next to the button that makes
            the empty year. */}
        {years.length > 1 && (
          <Button variant="outline" asChild>
            <Link href="/admin/school-years/promote">
              <GraduationCap className="size-4" />
              Promote students
            </Link>
          </Button>
        )}
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
          New school year
        </Button>
      </div>

      {years.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No school years yet"
          description="Create one before enrolling students or assessing fees."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              Create the first school year
            </Button>
          }
        />
      ) : (
        <TableScroller>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Starts</TableHead>
                <TableHead>Ends</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {years.map((y) => (
                <TableRow key={y.id}>
                  <TableCell className="font-medium">{y.name}</TableCell>
                  <TableCell className="text-sm">{formatDate(y.start_date)}</TableCell>
                  <TableCell className="text-sm">{formatDate(y.end_date)}</TableCell>
                  <TableCell>
                    {y.is_active ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="outline">Closed</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(y);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroller>
      )}

      <SchoolYearDialog open={open} onOpenChange={setOpen} year={editing} />
    </>
  );
}

function SchoolYearDialog({
  open,
  onOpenChange,
  year,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  year: SchoolYear | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useForm<SchoolYearValues>({
    resolver: zodResolver(formSchema),
    mode: "onTouched",
    defaultValues: {
      name: year?.name ?? "",
      start_date: year?.start_date ?? "",
      end_date: year?.end_date ?? "",
      is_active: year?.is_active ?? false,
    },
  });

  // The dialog is a singleton reused for "new" and for editing each row, so it
  // has to re-seed whenever the row behind it changes.
  const [lastId, setLastId] = useState(year?.id ?? null);
  if ((year?.id ?? null) !== lastId) {
    setLastId(year?.id ?? null);
    form.reset({
      name: year?.name ?? "",
      start_date: year?.start_date ?? "",
      end_date: year?.end_date ?? "",
      is_active: year?.is_active ?? false,
    });
  }

  function onSubmit(values: SchoolYearValues) {
    startTransition(async () => {
      const res = await saveSchoolYear({ id: year?.id, ...values });
      if (!res.ok) {
        form.setError("name", { message: res.error });
        return;
      }
      toast.success(year ? "School year updated." : "School year created.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{year ? "Edit school year" : "New school year"}</DialogTitle>
          <DialogDescription>
            Only one school year can be active at a time. Marking this one active
            closes the others.
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Name <RequiredMark />
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="2026-2027" className="font-mono" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Start date <RequiredMark />
                    </FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      End date <RequiredMark />
                    </FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Active school year</FormLabel>
                    <FormDescription>
                      New enrollments, charges and payments default to this year.
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
                {year ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
