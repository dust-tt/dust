import { usePathParam } from "@app/lib/platform";

export function useActiveAppId() {
  return usePathParam("appId");
}
