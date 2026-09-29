import type { NextConfig } from "next";
import { APP_BASEPATH } from "./lib/base-path";

/**
 * The marketplace is served from a subdirectory of its domain, not the domain
 * root. The value lives in lib/base-path.ts so the router and the application
 * code that builds API and buyer-link URLs can never disagree; see that module
 * for how each kind of URL is handled.
 */
const nextConfig: NextConfig = {
  basePath: APP_BASEPATH,
};

export default nextConfig;
