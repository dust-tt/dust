export const SCOPES = ["build", "run"] as const;
export type Scope = (typeof SCOPES)[number];
