export const VAULT_KINDS = ["regular", "global", "system"] as const;
export type VaultKind = (typeof VAULT_KINDS)[number];
