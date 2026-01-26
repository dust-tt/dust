export const WORKSPACE_NAME = "local";

export const EU_WORKSPACES = {} as const;

export const US_WORKSPACES = {
  dust: "xxxxxxx",
} as const;

export const EU_POD_ID = "xxx";
export const US_POD_ID = "xxx";

export type WorkspaceName =
  | keyof typeof EU_WORKSPACES
  | keyof typeof US_WORKSPACES;

export const WORKSPACE_CONFIG = {
  dust: { sid: "xxx", podId: US_POD_ID },
} as const;
