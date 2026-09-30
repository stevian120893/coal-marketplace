import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Admin save-form loading-state guard.
 *
 * Regression test for the "Menyimpan…" stuck-button bug: after a successful
 * edit save, router.refresh() re-renders the server data but deliberately
 * keeps the client component's useState intact, so a submit handler that never
 * left the "submitting" state would leave the Save button disabled forever
 * even though the save succeeded.
 *
 * The fix is structural: handleSubmit must wrap the fetch in try/catch/finally
 * and the finally block must always call setState, so the form exits the
 * loading state on success AND on failure. There is no React component test
 * harness here (jiti cannot import .tsx, and adding one means new
 * dependencies), so - like ui-terminology.test.ts - this statically pins the
 * pattern in the form sources themselves.
 */

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../app",
);

const SAVE_FORM_FILES = [
  path.join(APP_ROOT, "admin/buyers/buyer-form.tsx"),
  path.join(APP_ROOT, "admin/listings/listing-form.tsx"),
];

/**
 * The body of the first `finally { ... }` block in the file, with the closing
 * brace stripped. Regex-based on purpose: a static lint of source text, not a
 * parse - the only thing it must reliably find is the finally block attached
 * to the submit handler's try/catch.
 */
function findFinallyBody(source: string): string | null {
  const match = source.match(/finally\s*\{([\s\S]*?)\n\s*\}/);
  return match === null ? null : match[1];
}

test("admin save forms always exit the loading state after a save settles", async () => {
  for (const file of SAVE_FORM_FILES) {
    const source = await readFile(file, "utf8");
    const relative = path.relative(process.cwd(), file);
    const finallyBody = findFinallyBody(source);

    assert.ok(
      finallyBody !== null,
      `${relative}: handleSubmit must attach a finally block to its try/catch`,
    );
    assert.ok(finallyBody !== null && finallyBody.length > 0);

    // The finally block must reset the submit state so the button can become
    // usable again after the request finishes, in every outcome.
    assert.match(
      finallyBody,
      /setState\s*\(/,
      `${relative}: the finally block must reset the submit state`,
    );
    // On failure the reset is an error state; on success it leaves "submitting".
    assert.match(
      finallyBody,
      /\{ status: "idle" \}/,
      `${relative}: a successful save must return the form to idle`,
    );
    assert.match(
      finallyBody,
      /\{ status: "error"/,
      `${relative}: a failed save must surface the error message`,
    );
  }
});

test("admin save forms must not rely on a plain try/catch that can leave loading stuck", async () => {
  // The dangerous shape is a try/catch with NO finally at all: the success
  // path then never resets "submitting" (it only navigates/refreshes, which
  // preserves useState). Every admin save form is covered by the guard above.
  for (const file of SAVE_FORM_FILES) {
    const source = await readFile(file, "utf8");
    assert.ok(source.includes("try {"), `${file} uses a try block`);
    assert.ok(source.includes("finally {"), `${file} has a finally block`);
  }
});