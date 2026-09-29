/**
 * Bootstrap for `npm run admin:provision`.
 *
 * Mirrors prisma/run-seed.mjs: the script is spawned without a shell, so the
 * jiti loader cannot be configured inline. Loading it here is what lets the
 * TypeScript script import "@/generated/..." the same way the app does.
 */
import { createJiti } from "jiti";
import dotenv from "dotenv";

// Loads .env, same as `prisma db seed` does, so a local run picks up
// ADMIN_EMAIL / ADMIN_PASSWORD without them having to be exported by hand.
// quiet: true suppresses dotenv's startup banner.
dotenv.config({ quiet: true });

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
await jiti.import("./provision-admin.ts");
