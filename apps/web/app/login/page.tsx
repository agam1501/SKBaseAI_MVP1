"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      router.push("/clients");
    }
    setLoading(false);
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else {
      setError("Check your email to confirm your account.");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8 bg-white rounded-xl shadow">
        <h1 className="text-2xl font-bold">SKBaseAI</h1>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <form className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            required
          />

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50"
          >
            Sign In
          </button>
          <button
            onClick={handleSignUp}
            disabled={loading}
            className="w-full border rounded px-3 py-2 text-sm disabled:opacity-50"
          >
            Sign Up
          </button>
        </form>
      </div>
    </div>
  );
}
