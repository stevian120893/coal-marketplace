"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";

/**
 * Admin sign-in form.
 *
 * Posts to /api/admin/login, which sets the session cookie. The session token
 * is never handled here: it travels in the HttpOnly cookie, so this component
 * cannot read it and does not need to.
 */

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Second guard against an Enter-key repeat while the request is in flight.
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(withBasePath("/api/admin/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (response.status === 200) {
        // The cookie is already set; refresh so the server components re-run
        // with the new session, then leave the login page.
        router.replace("/admin/quote-requests");
        router.refresh();
        return;
      }

      setError(
        response.status === 400
          ? "Email dan kata sandi wajib diisi."
          : "Email atau kata sandi salah.",
      );
      setIsSubmitting(false);
    } catch {
      setError("Tidak dapat menghubungi server. Silakan coba lagi.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isSubmitting}>
      <div>
        <label
          htmlFor="admin-email"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Email
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isSubmitting}
          placeholder="admin@example.com"
          className={inputClass}
        />
      </div>

      <div>
        <label
          htmlFor="admin-password"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Kata Sandi
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isSubmitting}
          className={inputClass}
        />
      </div>

      {error !== null ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="min-h-11 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        {isSubmitting ? "Memproses..." : "Masuk"}
      </button>
    </form>
  );
}
