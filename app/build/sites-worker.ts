import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

type AccessIdentity = {
  email?: string;
  name?: string;
};

type AccessAwareExecutionContext = ExecutionContext<{
  CONNECTORS?: ConnectorBinding;
}> & {
  access?: {
    getIdentity(): Promise<AccessIdentity | null>;
  };
};

async function withCloudflareAccessIdentity(
  request: Request,
  env: Cloudflare.Env,
  ctx: AccessAwareExecutionContext,
): Promise<Request> {
  if (request.headers.has("oai-authenticated-user-id")) return request;

  const identity = ctx.access ? await ctx.access.getIdentity() : null;
  const accessEmail = identity?.email?.trim().toLowerCase();
  const singleUser = env.GYM_SINGLE_USER_MODE === "true";
  const email = accessEmail ??
    (singleUser ? env.GYM_SINGLE_USER_EMAIL ?? "gymtracker@danieta.com" : null);
  if (!email) return request;
  const userId = accessEmail
    ? `cloudflare:${accessEmail}`
    : env.GYM_SINGLE_USER_ID ?? "danieta-gymtracker";

  const authenticatedRequest = new Request(request);
  authenticatedRequest.headers.set("oai-authenticated-user-id", userId);
  authenticatedRequest.headers.set("oai-authenticated-user-email", email);
  const fullName = identity?.name ?? (singleUser ? "Gym Tracker" : null);
  if (fullName) {
    authenticatedRequest.headers.set(
      "oai-authenticated-user-full-name",
      encodeURIComponent(fullName),
    );
    authenticatedRequest.headers.set(
      "oai-authenticated-user-full-name-encoding",
      "percent-encoded-utf-8",
    );
  }
  return authenticatedRequest;
}

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: AccessAwareExecutionContext) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const authenticatedRequest = await withCloudflareAccessIdentity(
      request,
      env,
      ctx,
    );
    return runWithConnectorBinding(binding, () =>
      handler.fetch(authenticatedRequest, env, ctx),
    );
  },
};
