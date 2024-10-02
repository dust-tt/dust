import type { NextRouter } from "next/router";

export const setQueryParam = (
  router: NextRouter,
  key: string,
  value: string
) => {
  const q = router.query;
  q[key] = value;
  void router.push(
    {
      pathname: router.pathname,
      query: q,
    },
    undefined,
    { shallow: true }
  );
};
