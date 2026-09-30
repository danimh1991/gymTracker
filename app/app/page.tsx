import Tracker from "../components/Tracker";
import { appPath } from "../lib/base-path";
import { requireChatGPTUser } from "./chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireChatGPTUser(appPath("/"));
  return <Tracker />;
}
