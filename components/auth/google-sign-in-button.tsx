"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";

export function GoogleSignInButton({ next }: { next?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={signIn} disabled={loading} className="w-full" size="lg">
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <GoogleMark className="size-4" />
        )}
        Continue with Google
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.24 10.29v3.62h5.06a4.33 4.33 0 0 1-1.88 2.84l3.04 2.36c1.77-1.64 2.79-4.05 2.79-6.92 0-.67-.06-1.31-.17-1.93z"
      />
      <path
        fill="currentColor"
        d="M12.24 21c2.52 0 4.64-.83 6.19-2.26l-3.04-2.36c-.84.57-1.92.9-3.15.9-2.43 0-4.49-1.64-5.22-3.85l-3.13 2.42A9.32 9.32 0 0 0 12.24 21"
        opacity=".75"
      />
      <path
        fill="currentColor"
        d="M7.02 13.43a5.6 5.6 0 0 1 0-3.57L3.89 7.44a9.3 9.3 0 0 0 0 8.41z"
        opacity=".5"
      />
      <path
        fill="currentColor"
        d="M12.24 6.02c1.37 0 2.6.47 3.57 1.4l2.67-2.67C16.87 3.24 14.75 2.3 12.24 2.3A9.32 9.32 0 0 0 3.89 7.44l3.13 2.42c.73-2.21 2.79-3.84 5.22-3.84"
        opacity=".9"
      />
    </svg>
  );
}
