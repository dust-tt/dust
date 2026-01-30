import { useRequiredPathParam } from "@app/lib/platform";

export function useActiveConversationId() {
  const cId = useRequiredPathParam("cId");
  return cId === "new" ? null : cId;
}
