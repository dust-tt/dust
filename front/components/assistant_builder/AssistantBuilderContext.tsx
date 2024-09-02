import type { AppType, DataSourceViewType } from "@dust-tt/types";
import { createContext } from "react";

export const AssistantBuilderContext = createContext<{
  dustApps: AppType[];
  dataSourceViews: DataSourceViewType[];
}>({
  dustApps: [],
  dataSourceViews: [],
});

export function AssistantBuilderProvider({
  dustApps,
  dataSourceViews,
  children,
}: {
  dustApps: AppType[];
  dataSourceViews: DataSourceViewType[];
  children: React.ReactNode;
}) {
  return (
    <AssistantBuilderContext.Provider
      value={{
        dustApps,
        dataSourceViews,
      }}
    >
      {children}
    </AssistantBuilderContext.Provider>
  );
}
