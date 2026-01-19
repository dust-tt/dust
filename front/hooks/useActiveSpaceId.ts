import { useMemo } from "react";

import { useAppRouter } from "@app/lib/platform";

export function useActiveSpaceId() {
  const router = useAppRouter();
  const spaceId = useMemo(() => {
    return router.query.spaceId as string | null;
  }, [router.query.spaceId]);
  return spaceId;
}
