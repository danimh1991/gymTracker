const configuredBasePath =
  process.env.NEXT_PUBLIC_APP_BASE_PATH ?? process.env.APP_BASE_PATH ?? "";

export const APP_BASE_PATH = configuredBasePath
  ? `/${configuredBasePath.replace(/^\/+|\/+$/g, "")}`
  : "";

export function appPath(path = "/"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${APP_BASE_PATH}${normalizedPath}`;
}
