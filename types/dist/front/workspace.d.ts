export interface WorkspaceDomain {
    domain: string;
    domainAutoJoinEnabled: boolean;
}
export interface WorkspaceEnterpriseConnection {
    name: string;
    strategy: SupportedEnterpriseConnectionStrategies;
}
export type SupportedEnterpriseConnectionStrategies = "okta" | "samlp" | "waad";
export declare const supportedEnterpriseConnectionStrategies: SupportedEnterpriseConnectionStrategies[];
export declare const isSupportedEnterpriseConnectionStrategy: (strategy: string) => strategy is SupportedEnterpriseConnectionStrategies;
export declare function connectionStrategyToHumanReadable(strategy: SupportedEnterpriseConnectionStrategies): "Okta" | "SAML" | "Microsoft Entra ID";
//# sourceMappingURL=workspace.d.ts.map