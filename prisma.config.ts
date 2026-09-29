import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    // Prisma spawns this with execa (no shell), so the TypeScript loader is
    // configured in run-seed.mjs rather than via env vars on the command line.
    seed: "node prisma/run-seed.mjs",
  },
});