import { usePathParam } from "@app/lib/platform";

export function useActiveConversationId() {
  const cId = usePathParam("cId");
  return cId === "new" ? null : cId;
}
