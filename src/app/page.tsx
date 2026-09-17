import Workspace from "@/components/workspace";
import { getWorkspace } from "@/server/repository";

export const dynamic = "force-dynamic";
export default async function Page() {
  const initialData = await getWorkspace();
  return <Workspace initialData={initialData} />;
}
