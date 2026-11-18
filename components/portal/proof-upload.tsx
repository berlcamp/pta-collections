"use client";

import { useRef } from "react";
import { CheckCircle2, ImagePlus, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The GCash screenshot picker: one large dashed tap target.
 *
 * The real <input type="file"> is hidden and the tile clicks it, because the
 * native control is a tiny "Choose File" button no parent can hit with a thumb.
 */
export function ProofUpload({
  label,
  hint,
  fileName,
  uploading,
  done,
  onPick,
}: {
  label: string;
  hint: string;
  fileName: string | null;
  uploading: boolean;
  done: boolean;
  onPick: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => input.current?.click()}
        className={cn(
          "flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:opacity-60",
          done
            ? "border-emerald-300 bg-emerald-50"
            : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50",
        )}
      >
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            done ? "bg-emerald-100 text-emerald-700" : "bg-blue-50 text-blue-600",
          )}
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : done ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <ImagePlus className="size-5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">
            {fileName ?? label}
          </span>
          <span className="block text-xs text-slate-500">{hint}</span>
        </span>
      </button>
    </div>
  );
}
