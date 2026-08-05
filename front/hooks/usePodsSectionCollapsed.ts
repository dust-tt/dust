import { useSidebarSectionCollapsed } from "@app/hooks/useSidebarSectionCollapsed";

// Legacy key: the section was named "Projects" before it became "Pods".
const LOCAL_STORAGE_KEY = "projectsSectionCollapsed";

export const usePodsSectionCollapsed = () => {
  const { isCollapsed, setCollapsed } =
    useSidebarSectionCollapsed(LOCAL_STORAGE_KEY);

  return {
    isPodsSectionCollapsed: isCollapsed,
    setPodsSectionCollapsed: setCollapsed,
  };
};
