import { assertNever } from "./shared/utils/assert_never";

export interface WorkspaceDomain {
  domain: string;
  domainAutoJoinEnabled: boolean;
}

export interface WorkspaceEnterpriseConnection {
  name: string;
  strategy: Auth0SupportedEnterpriseConnectionStrategies;
}

export type Auth0SupportedEnterpriseConnectionStrategies =
  | "okta"
  | "samlp"
  | "waad";
export const auth0SupportedEnterpriseConnectionStrategies: Auth0SupportedEnterpriseConnectionStrategies[] =
  ["okta", "samlp", "waad"];

export const isSupportedEnterpriseConnectionStrategy = (
  strategy: string
): strategy is Auth0SupportedEnterpriseConnectionStrategies =>
  auth0SupportedEnterpriseConnectionStrategies.includes(
    strategy as Auth0SupportedEnterpriseConnectionStrategies
  );

export function connectionStrategyToHumanReadable(
  strategy: Auth0SupportedEnterpriseConnectionStrategies
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
