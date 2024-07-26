import { assertNever } from "../shared/utils/assert_never";

export interface WorkspaceDomain {
  domain: string;
  domainAutoJoinEnabled: boolean;
}

export interface WorkspaceEnterpriseConnection {
  name: string;
  strategy: SupportedEnterpriseConnectionStrategies;
}

export type SupportedEnterpriseConnectionStrategies = "okta" | "waad";
export const supportedEnterpriseConnectionStrategies: SupportedEnterpriseConnectionStrategies[] =
  ["okta", "waad"];

export function connectionStrategyToHumanReadable(
  strategy: SupportedEnterpriseConnectionStrategies
) {
  switch (strategy) {
    case "okta":
      return "Okta";

    case "waad":
      return "Microsoft Entra ID";

    default:
      assertNever(strategy);
  }
}
