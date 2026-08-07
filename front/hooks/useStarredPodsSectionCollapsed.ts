import { useSidebarSectionCollapsed } from "@app/hooks/useSidebarSectionCollapsed";

const LOCAL_STORAGE_KEY = "starredPodsSectionCollapsed";

export const useStarredPodsSectionCollapsed = () => {
  const { isCollapsed, setCollapsed } =
    useSidebarSectionCollapsed(LOCAL_STORAGE_KEY);

  return {
    isStarredPodsSectionCollapsed: isCollapsed,
    setStarredPodsSectionCollapsed: setCollapsed,
  };
};
