import type { NextConfig } from "next";

const configuredBasePath =
  process.env.APP_BASE_PATH ?? process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  basePath: configuredBasePath
    ? `/${configuredBasePath.replace(/^\/+|\/+$/g, "")}`
    : "",
};

export default nextConfig;
