"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";

/**
 * Sign-out control. Posts to /api/admin/logout, which revokes the session
 * server-side and clears the cookie, then returns to the login page.
 */
export function LogoutButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await fetch(withBasePath("/api/admin/logout"), { method: "POST" });
    } catch {
      // Even if the request fails, send the user to the login page; the
      // session is unusable client-side either way.
    }

    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isSubmitting}
      className="min-h-9 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {isSubmitting ? "Keluar..." : "Keluar"}
    </button>
  );
}
