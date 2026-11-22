export const LLM_CONTRACT_VERSION = "1" as const;

/**
 * Transport-level context shared with the LLM worker. Domain-specific session
 * data will be added later by a use-case adapter, not by this connection layer.
 */
export interface LlmRequestEnvelope<TPayload = unknown> {
  contractVersion: typeof LLM_CONTRACT_VERSION;
  requestId: string;
  operation: string;
  payload: TPayload;
  context?: {
    profileId?: string;
    locale?: string;
    timeZone?: string;
  };
}

export interface LlmResponseEnvelope<TResult = unknown> {
  contractVersion: typeof LLM_CONTRACT_VERSION;
  requestId: string;
  result?: TResult;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface LlmConnectionStatus {
  configured: boolean;
  reachable: boolean;
  transport: "service-binding" | "https" | "none";
  statusCode?: number;
  latencyMs?: number;
  error?: string;
}
