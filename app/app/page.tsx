import Tracker from "../components/Tracker";
import { requireChatGPTUser } from "./chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireChatGPTUser("/");
  return <Tracker />;
}
