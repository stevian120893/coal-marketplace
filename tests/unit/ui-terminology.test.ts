import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Terminology guard for the Bahasa Indonesia UI.
 *
 * The buyer's proposal is always "Harga Penawaran"; the final agreed deal is
 * always "Harga Kesepakatan" / "Harga Transaksi". The two must never be blurred:
 *
 *   - "Harga Final" and "Harga Jual" are never used anywhere on screen.
 *   - "Harga Penawaran" labels the buyer offer and is never mentioned on a
 *     line about the Transaksi.
 *   - "Harga Transaksi" labels the final deal and is never mentioned on a line
 *     about the Penawaran Pembeli.
 *   - The raw enum names never reach a screen: a label is always the Indonesian
 *     word, never "IN_NEGOTIATION" / "ACCEPTED" / "CONFIRMED" and friends.
 *
 * This test statically scans the app source files (which jiti cannot import as
 * .tsx) so a wording regression is caught at test time.
 */

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../app",
);

/** Admin, buyer and public screens are all scanned with the same rules. */
const APP_DIRS = [
  path.join(APP_ROOT, "admin"),
  path.join(APP_ROOT, "offer"),
  path.join(APP_ROOT, "listings"),
];

const NEVER_USED_PHRASES = ["harga final", "harga jual"];

/** Raw enum values must never be rendered as user-facing copy. */
const RAW_ENUM_VALUES = [
  "IN_NEGOTIATION",
  "LOW_NO_SPEC",
  "SPEC_COAL",
  "NEGOTIABLE",
  "FIXED",
  "DRAFT",
  "PUBLISHED",
];

/**
 * Removes block and line comments so prose in a doc comment is never mistaken
 * for rendered copy. Regex-based on purpose: this is a static lint of source
 * text, not a parse, and the only thing it must preserve is string literals.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/**
 * The literal text a browser would render from JSX: everything between a `>`
 * and the next `<`, with an interpolation or a tag opening the node.
 *
 * Deliberately narrow. It catches copy pasted straight into markup ("Status:
 * IN_NEGOTIATION"), which is the regression this guards, and ignores code,
 * string literals, and attributes, which are covered by their own tests.
 */
function jsxTextNodes(source: string): string[] {
  return [...source.matchAll(/>([^<>{}]+)</g)]
    .map((match) => match[1].trim())
    .filter((text) => text.length > 0);
}

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(full)));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function allScreenSourceFiles(): Promise<string[]> {
  const all = await Promise.all(APP_DIRS.map(collectSourceFiles));
  return all.flat();
}

test("the UI never says 'Harga Final' or 'Harga Jual'", async () => {
  const files = await allScreenSourceFiles();
  assert.ok(files.length > 0, "expected screen source files to scan");

  for (const file of files) {
    const source = (await readFile(file, "utf8")).toLowerCase();
    const relative = path.relative(process.cwd(), file);
    for (const phrase of NEVER_USED_PHRASES) {
      assert.equal(
        source.includes(phrase),
        false,
        `${relative} must not contain "${phrase}"`,
      );
    }
  }
});

test("Harga Penawaran and Harga Transaksi never label the wrong record", async () => {
  const files = await allScreenSourceFiles();

  for (const file of files) {
    const lines = (await readFile(file, "utf8")).toLowerCase().split("\n");
    const relative = path.relative(process.cwd(), file);
    for (const [index, line] of lines.entries()) {
      if (
        line.includes("harga transaksi") &&
        line.includes("penawaran pembeli")
      ) {
        assert.fail(
          `${relative}:${index + 1} mentions the transaction price in a buyer offer context`,
        );
      }
      if (line.includes("harga penawaran") && line.includes("transaksi")) {
        assert.fail(
          `${relative}:${index + 1} mentions the offer price in a transaction context`,
        );
      }
    }
  }
});

test("the UI uses the buyer-offer and transaction vocabulary", async () => {
  const files = await allScreenSourceFiles();
  const all = (
    await Promise.all(files.map((file) => readFile(file, "utf8")))
  ).join("\n");

  for (const phrase of [
    "Harga Penawaran",
    "Penawaran Pembeli",
    "Harga Transaksi",
    "Harga Kesepakatan",
    "Kuantitas",
    "Syarat Pembayaran",
    "Catatan",
  ]) {
    assert.ok(all.includes(phrase), `expected the "${phrase}" label`);
  }
});

test("the UI uses the Bahasa Indonesia offer status vocabulary", async () => {
  const files = await allScreenSourceFiles();
  const all = (
    await Promise.all(files.map((file) => readFile(file, "utf8")))
  ).join("\n");

  for (const label of [
    "Menunggu",
    "Dalam Negosiasi",
    "Disepakati",
    "Ditolak",
    "Dibatalkan",
  ]) {
    assert.ok(all.includes(label), `expected the status label "${label}"`);
  }
});

test("raw enum values are never used as rendered copy", async () => {
  const files = await allScreenSourceFiles();

  for (const file of files) {
    // Comments and code identifiers are never rendered; only JSX text is, so
    // that is exactly what gets scanned. A comparison like
    // `status === "PUBLISHED"` is code and is therefore not a violation.
    const source = stripComments(await readFile(file, "utf8"));
    const relative = path.relative(process.cwd(), file);
    for (const text of jsxTextNodes(source)) {
      for (const value of RAW_ENUM_VALUES) {
        assert.ok(
          !text.includes(value),
          `${relative} renders the raw enum value "${value}"`,
        );
      }
    }
  }
});
