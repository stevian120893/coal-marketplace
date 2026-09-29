import { prisma } from "@/lib/prisma";
import { getAdminCredentials } from "@/lib/admin/credentials";

/**
 * Provisions the admin account named by ADMIN_EMAIL.
 *
 * Separate from the seed on purpose: the seed creates demo marketplace data,
 * while this creates exactly one operator account. It is safe to re-run - the
 * account is upserted, and existing sessions are cleared whenever a role or
 * status is changed, so demoting an admin takes effect immediately rather than
 * at their next session expiry.
 *
 * The password is never read, written, or logged here. It lives only in the
 * environment, is compared at sign-in, and is not stored in the database.
 *
 * Run with: npm run admin:provision
 */

async function main(): Promise<void> {
  const credentials = getAdminCredentials();
  if (credentials === null) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must both be set before provisioning.",
    );
  }

  const email = credentials.email.toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, status: true },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN", status: "ACTIVE" },
    create: { id: `admin-${email}`, email, role: "ADMIN", status: "ACTIVE" },
    select: { id: true, email: true, role: true, status: true },
  });

  // A permission change must not leave a live session behind that would keep
  // working until it expires.
  const permissionChanged =
    existing !== null &&
    (existing.role !== user.role || existing.status !== user.status);

  if (permissionChanged) {
    const revoked = await prisma.adminSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    console.log(`Revoked ${revoked.count} active session(s) after the change.`);
  }

  const sessions = await prisma.adminSession.count({ where: { userId: user.id } });
  console.log(
    `Admin ready: ${user.email} (${user.id}) role=${user.role} status=${user.status}`,
  );
  console.log(`Active sessions for this account: ${sessions}`);
  console.log("Sign in at /admin/login with the ADMIN_EMAIL / ADMIN_PASSWORD pair.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(
      "Provisioning failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    await prisma.$disconnect();
    process.exit(1);
  });
