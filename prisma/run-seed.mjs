/**
 * Bootstrap for `prisma db seed`.
 *
 * Prisma runs the configured seed command with spawn(), not through a shell,
 * so the jiti loader cannot be configured with a `VAR=value` prefix. This
 * two-step bootstrap loads the real seed with tsconfig-paths support enabled,
 * which is what lets seed.ts import "@/generated/..." like the app does.
 */
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
await jiti.import("./seed.ts");
