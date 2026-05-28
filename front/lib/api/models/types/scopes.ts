export const SCOPES = ["build", "use"] as const;
export type Scope = (typeof SCOPES)[number];
