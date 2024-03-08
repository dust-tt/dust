export interface WorkspaceDomain {
  domain: string;
  domainAutoJoinEnabled: boolean;
}

export interface WorkspaceEnterpriseConnection {
  name: string;
}

export type SupportedEnterpriseConnectionStrategies = "okta";
export const supportedEnterpriseConnectionStrategies: SupportedEnterpriseConnectionStrategies[] =
  ["okta"];

export function isEnterpriseConnectionSub(
  sub: string
): sub is SupportedEnterpriseConnectionStrategies {
  const [provider] = sub.split("|");

  return supportedEnterpriseConnectionStrategies.includes(
    provider as SupportedEnterpriseConnectionStrategies
  );
}
