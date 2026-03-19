"use client";

import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function CallbackHandler() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Explicitly handle implicit flow: #access_token=...&refresh_token=...
    // detectSessionInUrl on createBrowserClient (SSR) does not reliably
    // process hash fragments — manually call setSession instead.
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) {
            setError(
              "Invitation link is invalid or expired. Please request a new invite.",
            );
          } else {
            router.replace("/auth/set-password");
          }
        });
      return;
    }

    // Fallback: PKCE flow (?code=) — handled automatically by createBrowserClient.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") && session) {
        router.replace("/auth/set-password");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/auth/set-password");
      }
    });

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
