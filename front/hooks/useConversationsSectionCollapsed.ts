import { useSidebarSectionCollapsed } from "@app/hooks/useSidebarSectionCollapsed";

const LOCAL_STORAGE_KEY = "conversationsSectionCollapsed";

export const useConversationsSectionCollapsed = () => {
  const { isCollapsed, setCollapsed } =
    useSidebarSectionCollapsed(LOCAL_STORAGE_KEY);

  return {
    isConversationsSectionCollapsed: isCollapsed,
    setConversationsSectionCollapsed: setCollapsed,
  };
};
