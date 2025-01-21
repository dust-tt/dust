import { assertNever } from "../shared/utils/assert_never";

export interface WorkspaceDomain {
  domain: string;
  domainAutoJoinEnabled: boolean;
}

export interface WorkspaceEnterpriseConnection {
  name: string;
  strategy: SupportedEnterpriseConnectionStrategies;
}

export type SupportedEnterpriseConnectionStrategies = "okta" | "samlp" | "waad";
export const supportedEnterpriseConnectionStrategies: SupportedEnterpriseConnectionStrategies[] =
  ["okta", "samlp", "waad"];

export const isSupportedEnterpriseConnectionStrategy = (
  strategy: string
): strategy is SupportedEnterpriseConnectionStrategies =>
  supportedEnterpriseConnectionStrategies.includes(
    strategy as SupportedEnterpriseConnectionStrategies
  );

export function connectionStrategyToHumanReadable(
  strategy: SupportedEnterpriseConnectionStrategies
) {
  switch (strategy) {
    case "okta":
      return "Okta";

    case "samlp":
      return "SAML";

    case "waad":
      return "Microsoft Entra ID";

    default:
      assertNever(strategy);
  }
}
