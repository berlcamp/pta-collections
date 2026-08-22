"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

export function SignOutButton({
  className,
  variant = "outline",
}: {
  className?: string;
  variant?: "outline" | "ghost" | "default";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    const supabase = createClient();
    // Scope 'local' clears only this app's namespaced session (storageKey
    // 'pta-auth'), leaving other apps on this shared Supabase project alone.
    await supabase.auth.signOut({ scope: "local" });
    router.push("/login");
    router.refresh();
  }

  return (
    <Button
      onClick={signOut}
      disabled={loading}
      variant={variant}
      className={className}
    >
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}
