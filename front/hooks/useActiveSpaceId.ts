import { useRouter } from "next/router";
import { useMemo } from "react";

export function useActiveSpaceId() {
  const router = useRouter();
  const spaceId = useMemo(() => {
    return router.query.spaceId as string | null;
  }, [router.query.spaceId]);
  return spaceId;
}
