import { usePathParam } from "@app/lib/platform";

export function useActiveSpaceId() {
  return usePathParam("spaceId");
}
