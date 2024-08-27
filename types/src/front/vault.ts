const VAULT_KINDS = ["regular", "global", "system"] as const;
export type VaultKind = (typeof VAULT_KINDS)[number];

export type VaultType = {
  name: string;
  sId: string;
  kind: VaultKind;
  groupIds: string[];
};

export interface ManagedDataSourceViewSelectedNode {
  name: string;
  parentsIn: string[] | null;
}
export type ManagedDataSourceViewsSelectedNodes =
  ManagedDataSourceViewSelectedNode[];
