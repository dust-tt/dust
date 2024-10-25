import type { NextRouter } from "next/router";

export const setQueryParam = (
  router: NextRouter,
  key: string,
  value: string,
  replace?: boolean
) => {
  const q = router.query;
  q[key] = value;

  if (replace) {
    void router.replace(
      {
        pathname: router.pathname,
        query: q,
      },
      undefined,
      { shallow: true }
    );
    return;
  }

  void router.push(
    {
      pathname: router.pathname,
      query: q,
    },
    undefined,
    { shallow: true }
  );
};
