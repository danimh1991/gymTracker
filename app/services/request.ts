export const MAX_TRAINING_REQUEST_BYTES = 10 * 1024 * 1024;

export class RequestTooLargeError extends Error {
  constructor() {
    super("Solicitud demasiado grande.");
    this.name = "RequestTooLargeError";
  }
}

export async function readTrainingRequest(
  request: Request,
  maxBytes = MAX_TRAINING_REQUEST_BYTES,
): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes)
    throw new RequestTooLargeError();

  const body = await request.arrayBuffer();
  if (body.byteLength > maxBytes) throw new RequestTooLargeError();

  return JSON.parse(new TextDecoder().decode(body));
}
