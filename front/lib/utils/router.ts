import type { SystemPodTab } from "@app/hooks/useSpaceProjectTabs";
import type { AppRouter } from "@app/lib/platform";

export const setQueryParam = (
  router: AppRouter,
  key: string,
  value: string
) => {
  const q = router.query;
  q[key] = value;

  // Preserve the hash when updating query params
  const hash = window.location.hash;

  void router
    .push(
      {
        pathname: router.pathname,
        query: q,
      },
      undefined,
      { shallow: true }
    )
    .then(() => {
      // Restore hash after router.push (Next.js doesn't preserve it)
      if (hash && window.location.hash !== hash) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}${hash}`
        );
      }
    });
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

export const getSkillBuilderRoute = (
  workspaceId: string,
  route: string,
  queryParams?: string
): string => {
  const basePath = "skills";
  const fullPath = `/w/${workspaceId}/builder/${basePath}${route === "manage" ? "" : `/${route}`}`;
  return queryParams ? `${fullPath}?${queryParams}` : fullPath;
};

export const getManageAgentsRoute = (workspaceId: string, agentId?: string) => {
  return (
    `/w/${workspaceId}/builder/agents` + (agentId ? `#?agentId=${agentId}` : "")
  );
};

export const getManageSkillsRoute = (workspaceId: string, skillId?: string) => {
  return (
    `/w/${workspaceId}/builder/skills` + (skillId ? `#?skillId=${skillId}` : "")
  );
};

export const getConversationRoute = (
  workspaceId: string,
  conversationIdOrNew: string | null = "new",
  queryParams?: string,
  baseUrl?: string
): string => {
  const conversationId = conversationIdOrNew ?? "new";
  const fullPath = `/w/${workspaceId}/conversation/${conversationId}`;
  const route = queryParams ? `${fullPath}?${queryParams}` : fullPath;
  return baseUrl ? `${baseUrl}${route}` : route;
};

export const getSpaceRoute = (workspaceId: string, spaceId: string) => {
  return `/w/${workspaceId}/spaces/${spaceId}`;
};

export const getPodRoute = (
  workspaceId: string,
  spaceId: string,
  podTab?: SystemPodTab,
  queryParams?: string
) => {
  const fullPath = `/w/${workspaceId}/pods/${spaceId}`;
  const route = queryParams ? `${fullPath}?${queryParams}` : fullPath;
  return podTab ? `${route}#${podTab}` : route;
};

/**
 * Navigate to a pod (optional tab + query). Same-path jumps set `location.hash`
 * so `usePodTabs`' `hashchange` listener re-runs — React Router hash updates use
 * pushState and do not fire `hashchange`.
 */
export function navigateToPod(
  push: (href: string) => void,
  workspaceId: string,
  spaceId: string,
  podTab?: SystemPodTab,
  queryParams?: string
): void {
  const href = getPodRoute(workspaceId, spaceId, podTab, queryParams);
  const target = new URL(href, window.location.origin);
  const samePath = target.pathname === window.location.pathname;

  if (!samePath) {
    push(href);
    return;
  }

  // Already on this pod. Update search via the router when it changes so
  // `?agent=` / `?user=` apply, then set the hash to fire `hashchange`.
  if (target.search !== window.location.search) {
    push(href);
  }

  if (!podTab) {
    return;
  }

  const nextHash = `#${podTab}`;
  if (window.location.hash === nextHash) {
    window.location.hash = "";
  }
  window.location.hash = podTab;
}
