import type { LlmConnectionStatus } from "./contract";

export interface LlmFetchTransport {
  fetch(request: Request): Promise<Response>;
}

export interface LlmClientOptions {
  transport?: LlmFetchTransport;
  baseUrl?: string;
  token?: string;
  healthPath?: string;
  timeoutMs?: number;
  transportKind?: "service-binding" | "https";
}

export class LlmWorkerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmWorkerError";
  }
}

const DEFAULT_TIMEOUT_MS = 8_000;

export class LlmWorkerClient {
  private readonly baseUrl: string;
  private readonly healthPath: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: LlmClientOptions) {
    this.baseUrl = (options.baseUrl ?? "https://llm.internal").replace(
      /\/$/,
      "",
    );
    this.healthPath = normalizePath(options.healthPath ?? "/health");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get configured() {
    return Boolean(this.options.transport || this.options.baseUrl);
  }

  get transportKind(): LlmConnectionStatus["transport"] {
    if (!this.configured) return "none";
    return (
      this.options.transportKind ??
      (this.options.transport ? "service-binding" : "https")
    );
  }

  async status(): Promise<LlmConnectionStatus> {
    if (!this.configured) {
      return { configured: false, reachable: false, transport: "none" };
    }

    const startedAt = Date.now();
    try {
      const response = await this.request(this.healthPath, { method: "GET" });
      return {
        configured: true,
        reachable: response.ok,
        transport: this.transportKind,
        statusCode: response.status,
        latencyMs: Date.now() - startedAt,
        ...(!response.ok ? { error: `HTTP ${response.status}` } : {}),
      };
    } catch (error) {
      return {
        configured: true,
        reachable: false,
        transport: this.transportKind,
        latencyMs: Date.now() - startedAt,
        error: safeErrorMessage(error),
      };
    }
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.configured)
      throw new LlmWorkerError("Worker LLM no configurado.");

    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (this.options.token)
      headers.set("authorization", `Bearer ${this.options.token}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const request = new Request(`${this.baseUrl}${normalizePath(path)}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    try {
      return this.options.transport
        ? await this.options.transport.fetch(request)
        : await fetch(request);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new LlmWorkerError("El worker LLM no respondió a tiempo.");
      }
      throw new LlmWorkerError(safeErrorMessage(error));
    } finally {
      clearTimeout(timer);
    }
  }
}

function normalizePath(path: string) {
  const value = path.trim();
  if (!value || value === "/") return "/";
  return `/${value.replace(/^\/+|\/+$/g, "")}`;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No se pudo contactar con el worker LLM.";
}
