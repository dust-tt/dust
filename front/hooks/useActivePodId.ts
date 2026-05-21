import { usePathParam } from "@app/lib/platform";

export function useActivePodId() {
  return usePathParam("podId");
}
