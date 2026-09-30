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
  ctx: AccessAwareExecutionContext,
): Promise<Request> {
  if (request.headers.has("oai-authenticated-user-id") || !ctx.access) {
    return request;
  }

  const identity = await ctx.access.getIdentity();
  const email = identity?.email?.trim().toLowerCase();
  if (!email) return request;

  const authenticatedRequest = new Request(request);
  authenticatedRequest.headers.set(
    "oai-authenticated-user-id",
    `cloudflare:${email}`,
  );
  authenticatedRequest.headers.set("oai-authenticated-user-email", email);
  if (identity?.name) {
    authenticatedRequest.headers.set(
      "oai-authenticated-user-full-name",
      encodeURIComponent(identity.name),
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
    const authenticatedRequest = await withCloudflareAccessIdentity(request, ctx);
    return runWithConnectorBinding(binding, () =>
      handler.fetch(authenticatedRequest, env, ctx),
    );
  },
};
