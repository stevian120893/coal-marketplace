import { createJiti } from "jiti";
import dotenv from "dotenv";
dotenv.config({ quiet: true });
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const suite = process.argv[2];
await jiti.import(suite);
