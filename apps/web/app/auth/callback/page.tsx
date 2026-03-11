"use client";

import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function CallbackHandler() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // createBrowserClient (detectSessionInUrl: true) automatically processes
    // both PKCE (?code=) and implicit (#access_token=) flows and clears the
    // URL before our effect runs. Manually re-parsing the hash or calling
    // exchangeCodeForSession here would double-process the tokens and fail.
    // Instead, subscribe to the SIGNED_IN event that auto-detection fires.

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") && session) {
        router.replace("/auth/set-password");
      }
    });

    // If SIGNED_IN fired before our subscription was created, a session
    // already exists — redirect immediately.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/auth/set-password");
      }
    });

    // After 5s with no session, the link is invalid or expired.
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setError(
          "Invitation link is invalid or expired. Please request a new invite.",
        );
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [supabase, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">Verifying invitation…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted-foreground">Verifying invitation…</p>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
