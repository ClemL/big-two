import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/**
 * Build stamp is resolved once, at build time, so the server and client render
 * the same string and hydration stays clean.
 */
const buildTime = new Date().toISOString().replace("T", " ").slice(0, 16);
const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
    NEXT_PUBLIC_COMMIT_SHA: commit,
  },
};

export default nextConfig;
