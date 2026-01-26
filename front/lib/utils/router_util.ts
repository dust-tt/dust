import type { AppRouter } from "@app/lib/platform";

export const removeParamFromRouter = async (
  router: AppRouter,
  keys: string | string[]
) => {
  const params = Array.isArray(keys) ? keys : [keys];
  const nextQuery = { ...router.query };

  let didUpdate = false;
  for (const param of params) {
    if (param in nextQuery) {
      delete nextQuery[param];
      didUpdate = true;
    }
  }

  if (!didUpdate) {
    return;
  }

  await router.replace(
    {
      pathname: router.pathname,
      query: nextQuery,
    },
    undefined,
    { shallow: true }
  );
};
