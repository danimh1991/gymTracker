import { env } from "cloudflare:workers";
import { LlmWorkerClient } from "./client";

export function llmWorkerClient() {
  const serviceBinding = env.LLM_WORKER;
  const url = env.LLM_WORKER_URL?.trim();

  return new LlmWorkerClient({
    transport: serviceBinding,
    baseUrl: serviceBinding ? "https://llm.internal" : url,
    token: serviceBinding ? undefined : env.LLM_WORKER_TOKEN,
    healthPath: env.LLM_HEALTH_PATH,
    transportKind: serviceBinding
      ? "service-binding"
      : url
        ? "https"
        : undefined,
  });
}

export function llmDataBucket() {
  return env.LLM_DATA;
}
