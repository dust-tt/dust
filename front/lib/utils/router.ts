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

export const parseQueryString = (url: string) => {
  // Remove everything before the query string
  const queryString = url.split("?")[1] || "";
  const searchParams = new URLSearchParams(queryString);

  // Convert to plain object
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    params[key] = value;
  });

  return params;
};

export const getAgentBuilderRoute = (
  workspaceId: string,
  route: string,
  queryParams?: string
): string => {
  const basePath = "agents";
  const fullPath = `/w/${workspaceId}/builder/${basePath}${route === "manage" ? "" : `/${route}`}`;
  return queryParams ? `${fullPath}?${queryParams}` : fullPath;
};

export const getAgentRoute = (
  workspaceId: string,
  conversationIdOrNew: string = "new",
  queryParams?: string
): string => {
  const fullPath = `/w/${workspaceId}/agent/${conversationIdOrNew}`;
  return queryParams ? `${fullPath}?${queryParams}` : fullPath;
};
