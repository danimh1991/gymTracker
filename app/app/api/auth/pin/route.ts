import {
  expiredSessionCookie,
  isPinAuthenticated,
  sessionCookie,
  validPin,
} from "../../../pin-auth";

export async function GET(request: Request) {
  if (!(await isPinAuthenticated(request))) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  return Response.json({ authenticated: true });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Origen no permitido." }, { status: 403 });
  }

  let pin: unknown;
  try {
    ({ pin } = (await request.json()) as { pin?: unknown });
  } catch {
    return Response.json({ error: "Introduce un PIN válido." }, { status: 400 });
  }

  if (!validPin(pin)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return Response.json({ error: "El PIN no es correcto." }, { status: 401 });
  }

  return Response.json(
    { authenticated: true },
    { headers: { "Set-Cookie": await sessionCookie(request) } },
  );
}

export function DELETE(request: Request) {
  return Response.json(
    { authenticated: false },
    { headers: { "Set-Cookie": expiredSessionCookie(request) } },
  );
}
