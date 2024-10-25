import type { AppType, DataSourceViewType, SpaceType } from "@dust-tt/types";
import { createContext } from "react";

type AssistantBuilderContextType = {
  dustApps: AppType[];
  dataSourceViews: DataSourceViewType[];
  vaults: SpaceType[];
};

export const AssistantBuilderContext =
  createContext<AssistantBuilderContextType>({
    dustApps: [],
    dataSourceViews: [],
    vaults: [],
  });

export function AssistantBuilderProvider({
  dustApps,
  dataSourceViews,
  vaults,
  children,
}: AssistantBuilderContextType & {
  children: React.ReactNode;
}) {
  return (
    <AssistantBuilderContext.Provider
      value={{
        dustApps,
        dataSourceViews,
        vaults,
      }}
    >
      {children}
    </AssistantBuilderContext.Provider>
  );
}
