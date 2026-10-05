const ACCESS_PIN = process.env.APP_ACCESS_PIN ?? "0812";
const SESSION_SECRET =
  process.env.PIN_SESSION_SECRET ?? "gym-tracker-private-session-v1";

export const PIN_COOKIE = "gym_tracker_access";

async function sessionToken() {
  const input = new TextEncoder().encode(`${SESSION_SECRET}:${ACCESS_PIN}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const item of cookies.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function isPinAuthenticated(request: Request) {
  return cookieValue(request, PIN_COOKIE) === (await sessionToken());
}

export async function pinGuard(request: Request) {
  if (await isPinAuthenticated(request)) return null;
  return Response.json(
    { error: "Introduce el PIN para acceder a la aplicación." },
    { status: 401 },
  );
}

export function validPin(pin: unknown) {
  return typeof pin === "string" && pin === ACCESS_PIN;
}

export async function sessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${PIN_COOKIE}=${await sessionToken()}; Path=/; HttpOnly; SameSite=Strict${secure}`;
}

export function expiredSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${PIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
