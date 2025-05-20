import { createContext, useState } from "react";

import { mcpServerViewSortingFn } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { AppType, DataSourceViewType, SpaceType } from "@app/types";

type AssistantBuilderContextType = {
  dustApps: AppType[];
  dataSourceViews: DataSourceViewType[];
  spaces: SpaceType[];
  mcpServerViews: MCPServerViewType[];
  isPreviewPanelOpen: boolean;
  setIsPreviewPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export const AssistantBuilderContext =
  createContext<AssistantBuilderContextType>({
    dustApps: [],
    dataSourceViews: [],
    spaces: [],
    mcpServerViews: [],
    isPreviewPanelOpen: true,
    setIsPreviewPanelOpen: () => {},
  });

export function AssistantBuilderProvider({
  dustApps,
  dataSourceViews,
  spaces,
  mcpServerViews,
  children,
}: Omit<
  AssistantBuilderContextType,
  "isPreviewPanelOpen" | "setIsPreviewPanelOpen"
> & {
  children: React.ReactNode;
}) {
  const [isPreviewPanelOpen, setIsPreviewPanelOpen] = useState(false);

  return (
    <AssistantBuilderContext.Provider
      value={{
        dustApps,
        dataSourceViews,
        spaces,
        mcpServerViews: mcpServerViews.sort(mcpServerViewSortingFn),
        isPreviewPanelOpen,
        setIsPreviewPanelOpen,
      }}
    >
      {children}
    </AssistantBuilderContext.Provider>
  );
}
