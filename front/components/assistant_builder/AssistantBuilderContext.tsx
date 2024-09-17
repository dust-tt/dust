import type {
  AppType,
  DataSourceViewType,
  PlanType,
  VaultType,
} from "@dust-tt/types";
import { createContext } from "react";

type AssistantBuilderContextType = {
  dustApps: AppType[];
  dataSourceViews: DataSourceViewType[];
  vaults: VaultType[];
  plan: PlanType | undefined;
  dustClientFacingUrl: string | undefined;
};

export const AssistantBuilderContext =
  createContext<AssistantBuilderContextType>({
    dustApps: [],
    dataSourceViews: [],
    vaults: [],
    dustClientFacingUrl: undefined,
    plan: undefined,
  });

export function AssistantBuilderProvider({
  dustApps,
  dataSourceViews,
  vaults,
  dustClientFacingUrl,
  plan,
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
        dustClientFacingUrl,
        plan,
      }}
    >
      {children}
    </AssistantBuilderContext.Provider>
  );
}
