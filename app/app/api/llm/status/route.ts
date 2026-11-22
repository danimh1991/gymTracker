import {
  llmDataBucket,
  llmWorkerClient,
} from "../../../../integrations/llm/runtime";
import { pinGuard } from "../../../pin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = await pinGuard(request);
  if (unauthorized) return unauthorized;

  const worker = await llmWorkerClient().status();
  return Response.json(
    {
      worker,
      r2: { configured: Boolean(llmDataBucket()) },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
