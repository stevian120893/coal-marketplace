import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authorizeAdminPage } from "@/lib/admin/authorize";
import { LoginForm } from "./login-form";

/**
 * Admin sign-in page.
 *
 * Deliberately reachable without a session, so it must never call
 * requireAdminPage. An already-signed-in admin is sent straight to the console
 * instead of being shown a pointless form.
 */

export const metadata: Metadata = {
  title: "Masuk Admin",
  description: "Masuk ke konsol admin marketplace batubara.",
};

export default async function AdminLoginPage() {
  const auth = await authorizeAdminPage();
  if (auth.ok) {
    redirect("/admin/quote-requests");
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10 sm:px-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Admin
        </p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-50">
          Masuk
        </h1>
        <p className="mt-1 mb-5 text-sm text-slate-600 dark:text-slate-400">
          Akses staf untuk proposal batubara.
        </p>

        <LoginForm />
      </div>
    </main>
  );
}
