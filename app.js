#!/usr/bin/env node
"use strict";

/**
 * cPanel / Passenger startup file for the Coal Marketplace.
 *
 * Passenger needs a script it can launch with `node`. The application itself
 * has no custom server: it is a stock Next.js 16 server, already started in
 * production by `npm start` -> `next start`. So this file does not reimplement
 * that server. It starts the real one and then stays out of the way.
 *
 * The only reason a wrapper exists at all is that cPanel requires a file
 * rather than an npm script. Everything below exists to make
 *
 *     node app.js
 *
 * behave exactly like
 *
 *     npm start
 *
 * with the port the hosting panel assigned.
 *
 * Design constraints this file honours:
 *
 *   - No second server architecture. The actual HTTP server is the one that
 *     ships with the installed Next.js. There is no Express, no Fastify, no
 *     hand-rolled `http.createServer`, and no programmatic `next()` server, so
 *     there is nothing to keep in sync with the framework.
 *   - No hardcoded port. The port always comes from process.env.PORT, which is
 *     what Passenger sets and what it then proxies to.
 *   - No hardcoded host. See resolveBindHost() for why the HOSTNAME variable
 *     needs care.
 *   - No environment rewriting. The child inherits process.env unchanged, so
 *     DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD and APP_BASE_URL reach the
 *     application exactly as cPanel configured them. NODE_ENV is deliberately
 *     NOT set here: `next start` already defaults it to "production" itself,
 *     and forcing it would overwrite a value the operator set on purpose.
 *   - No dependency added. Node built-ins and the installed Next.js only.
 *
 * On cPanel, set this file as the Application startup file in
 * "Setup Node.js App" and leave the application mode on Production.
 */

/* eslint-disable @typescript-eslint/no-require-imports --
 * This file is deliberately CommonJS. cPanel launches it as `node app.js`,
 * and package.json declares no "type": "module", so a .js entry point here is
 * CommonJS by definition. The rule steers towards ESM, which would mean
 * renaming the file and changing how the hosting panel invokes it. That is
 * the panel's contract, not ours to change, so the rule is disabled for this
 * file only. No application code is affected.
 */
const { spawn } = require("node:child_process");

/** The application root: this file sits next to package.json and .next/. */
const APP_ROOT = __dirname;

/** Signals Passenger may send to stop or reload the application. */
const FORWARDED_SIGNALS = ["SIGTERM", "SIGINT", "SIGHUP"];

/**
 * Locates the Next.js CLI inside the installed package.
 *
 * The `next` package declares no "exports" map, so this subpath resolves
 * normally. Resolving it here rather than relying on `node_modules/.bin/next`
 * avoids depending on the .bin shim, which is a symlink on some installs and
 * may not be executable inside a panel's sandbox.
 *
 * @returns {string | null} absolute path to the CLI entry, or null if Next.js
 *   is not installed. Resolution is read-only and never contacts the network.
 */
function resolveNextCli() {
  try {
    return require.resolve("next/dist/bin/next");
  } catch {
    return null;
  }
}

/**
 * Decides which host address to bind, if any.
 *
 * `next start` already defaults to 0.0.0.0, which is exactly what Passenger
 * wants: a listening socket on every interface, with the panel's proxy in
 * front of it.
 *
 * process.env.HOSTNAME is a trap and must not be forwarded blindly. On Linux -
 * which is what cPanel runs - the shell, systemd and SSH routinely export
 * HOSTNAME as the *machine* hostname, for example "server123.webhost.example".
 * That is not a bindable address. Handing it to `next start -H` makes Node
 * try to resolve it as a name and bind to the resulting address, which either
 * fails outright or binds somewhere Passenger cannot reach. A container's
 * HOSTNAME is often a generated container id with the same problem.
 *
 * So HOSTNAME is honoured only when it really is a bindable address: an IPv4
 * literal, an IPv6 literal, or a wildcard. Anything else is ignored, and
 * Next.js falls back to its own 0.0.0.0 default. The variable is still passed
 * through in the environment untouched; it is only the -H flag that is
 * withheld, because `next start` never reads HOSTNAME from the environment by
 * itself.
 *
 * @param {string | undefined} value raw process.env.HOSTNAME
 * @returns {string | null} the address to pass to -H, or null to let Next.js
 *   use its default.
 */
function resolveBindHost(value) {
  if (typeof value !== "string") return null;
  const host = value.trim();
  if (host.length === 0) return null;

  // Wildcards.
  if (host === "0.0.0.0" || host === "::" || host === "::0") return host;

  // IPv4 literal, e.g. "127.0.0.1" or "10.0.0.7".
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return host.split(".").every((octet) => Number(octet) <= 255) ? host : null;
  }

  // IPv6 literal, e.g. "::1" or "fe80::1". Requires a colon, which is what
  // separates it from a machine hostname.
  if (host.includes(":") && /^[0-9a-fA-F:.]+$/.test(host)) return host;

  // A resolvable name such as "server123.webhost.example": not a bind address.
  return null;
}

/**
 * Builds the argument list for the Next.js CLI.
 *
 * @returns {string[]} arguments for `next start`, beginning with the
 *   subcommand. The application root is passed explicitly so the server finds
 *   the .next/ build output regardless of the working directory Passenger
 *   happens to launch us from.
 */
function buildArgs() {
  const args = ["start", APP_ROOT];

  // The port the panel assigned. Never defaulted here on purpose: if it is
  // unset we let Next.js apply its own default rather than inventing one.
  const port = process.env.PORT;
  if (typeof port === "string" && port.trim().length > 0) {
    args.push("--port", port.trim());
  }

  const host = resolveBindHost(process.env.HOSTNAME);
  if (host !== null) {
    args.push("--hostname", host);
  }

  return args;
}

/**
 * Starts the production server and mirrors its lifetime.
 *
 * @returns {void}
 */
function main() {
  const nextCli = resolveNextCli();
  if (nextCli === null) {
    console.error(
      "[app.js] Could not resolve the Next.js CLI. Run `npm ci` in the application root before starting.",
    );
    process.exit(1);
    return;
  }

  if (typeof process.env.PORT !== "string" || process.env.PORT.trim().length === 0) {
    console.warn(
      "[app.js] PORT is not set. Falling back to the Next.js default; under cPanel it should be assigned automatically.",
    );
  }

  const args = buildArgs();
  const port = typeof process.env.PORT === "string" ? process.env.PORT.trim() : null;
  const host = resolveBindHost(process.env.HOSTNAME);
  console.log(
    `[app.js] Starting Next.js in production mode on port ${port ?? "(Next.js default)"} bound to ${
      host ?? "0.0.0.0 (Next.js default)"
    }.`,
  );

  // process.execPath runs the CLI with the same Node binary that is running
  // this file, so the panel's chosen version is the one used. stdio "inherit"
  // keeps the panel's log stream intact. env is passed unchanged so every
  // variable cPanel configured reaches the application.
  const child = spawn(process.execPath, [nextCli, ...args], {
    cwd: APP_ROOT,
    env: process.env,
    stdio: "inherit",
  });

  // Passenger stops the application by signalling it. Relay the signal so the
  // Next.js server can finish in-flight requests and shut down cleanly instead
  // of being orphaned until the panel force-kills the process tree.
  for (const signal of FORWARDED_SIGNALS) {
    process.on(signal, () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(signal);
      }
    });
  }

  child.on("error", (error) => {
    console.error(`[app.js] Failed to start the Next.js server: ${error.message}`);
    process.exit(1);
  });

  // Exit with the server's own status so the panel reports a real failure
  // rather than a successful-looking process. A null code means the server was
  // terminated by a signal, which is not a clean success either.
  child.on("exit", (code, signal) => {
    if (signal !== null) {
      process.exit(1);
      return;
    }
    process.exit(typeof code === "number" ? code : 0);
  });
}

main();
