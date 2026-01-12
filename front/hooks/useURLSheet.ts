import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

export function useURLSheet(paramName: string) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (router.isReady) {
      setIsOpen(router.query[paramName] === "true");
    }
  }, [router.isReady, paramName, router.query]);

  const onOpenChange = useCallback(
    (open: boolean) => {
      const { [paramName]: _, ...restQuery } = router.query;
      const hash = router.asPath.split("#")[1] || undefined;

      void router.push(
        {
          pathname: router.pathname,
          query: open ? { ...restQuery, [paramName]: "true" } : restQuery,
          hash,
        },
        undefined,
        { shallow: true }
      );
    },
    [router, paramName]
  );

  return { isOpen, onOpenChange };
}
