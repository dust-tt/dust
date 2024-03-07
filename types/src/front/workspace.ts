export interface WorkspaceDomain {
  domain: string;
  domainAutoJoinEnabled: boolean;
}

export interface WorkspaceEnterpriseConnection {
  name: string;
}

export type SupportedEnterpriseConnectionStrategies = "okta";
