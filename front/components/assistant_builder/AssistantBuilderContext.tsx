import type {
  AppType,
  DataSourceViewType,
  PlatformActionsConfigurationType,
  SpaceType,
} from "@dust-tt/types";
import { createContext } from "react";

type AssistantBuilderContextType = {
  dustApps: AppType[];
  dataSourceViews: DataSourceViewType[];
  spaces: SpaceType[];
  platformActionsConfigurations: PlatformActionsConfigurationType[];
};

export const AssistantBuilderContext =
  createContext<AssistantBuilderContextType>({
    dustApps: [],
    dataSourceViews: [],
    spaces: [],
    platformActionsConfigurations: [],
  });

export function AssistantBuilderProvider({
  dustApps,
  dataSourceViews,
  spaces,
  platformActionsConfigurations,
  children,
}: AssistantBuilderContextType & {
  children: React.ReactNode;
}) {
  return (
    <AssistantBuilderContext.Provider
      value={{
        dustApps,
        dataSourceViews,
        spaces,
        platformActionsConfigurations,
      }}
    >
      {children}
    </AssistantBuilderContext.Provider>
  );
}
