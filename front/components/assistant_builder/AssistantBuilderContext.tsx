import type {
  AppType,
  DataSourceType,
  DataSourceViewType,
} from "@dust-tt/types";
import { createContext } from "react";

export const AssistantBuilderContext = createContext<{
  dustApps: AppType[];
  dataSources: DataSourceType[];
  dataSourceViews: DataSourceViewType[];
}>({
  dustApps: [],
  dataSources: [],
  dataSourceViews: [],
});

export function AssistantBuilderProvider({
  dustApps,
  dataSources,
  dataSourceViews,
  children,
}: {
  dustApps: AppType[];
  dataSources: DataSourceType[];
  dataSourceViews: DataSourceViewType[];
  children: React.ReactNode;
}) {
  return (
    <AssistantBuilderContext.Provider
      value={{
        dustApps,
        dataSources,
        dataSourceViews,
      }}
    >
      {children}
    </AssistantBuilderContext.Provider>
  );
}
