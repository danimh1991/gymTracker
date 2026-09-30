import { getChatGPTUser } from "../../chatgpt-auth";
import { repository } from "../../../database/connection";
import { commandSchema } from "../../../services/validation";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: "Inicia sesión para acceder a tus entrenamientos." },
      { status: 401 },
    );
  try {
    return Response.json(
      await repository(
        user.userId,
        new URL(request.url).searchParams.get("demo") === "1",
      ).snapshot(),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        error: "No se han podido cargar los datos. Reintenta en unos segundos.",
      },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: "Origen no permitido." }, { status: 403 });
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: "Tu sesión ha caducado. Vuelve a iniciar sesión." },
      { status: 401 },
    );
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 20000)
      return Response.json(
        { error: "Solicitud demasiado grande." },
        { status: 413 },
      );
    const parsed = commandSchema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json(
        { error: parsed.error.issues.map((i) => i.message).join(" ") },
        { status: 400 },
      );
    const repo = repository(
      user.userId,
      new URL(request.url).searchParams.get("demo") === "1",
    );
    await repo.execute(parsed.data);
    return Response.json(await repo.snapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(error);
    const msg = error instanceof Error ? error.message : "";
    return Response.json(
      {
        error: /D1|SQLITE|database|constraint/i.test(msg)
          ? "No se ha podido guardar. Tus datos introducidos se mantienen; reintenta o actualiza."
          : msg || "No se ha podido guardar.",
      },
      { status: 409 },
    );
  }
}
