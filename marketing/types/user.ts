export type RoleType = "admin" | "builder" | "user" | "none";

export type WorkspaceSegmentationType = "interesting" | null;

export type WorkspaceSharingPolicy =
  | "workspace_only"
  | "workspace_and_emails"
  | "all_scopes";

export type LightWorkspaceType = {
  id: number;
  sId: string;
  name: string;
  role: RoleType;
  segmentation: WorkspaceSegmentationType;
  whiteListedProviders: string[] | null;
  defaultEmbeddingProvider: string | null;
  regionalModelsOnly: boolean;
  metadata?: {
    [key: string]: string | number | boolean | object | undefined;
  } | null;
  sharingPolicy: WorkspaceSharingPolicy;
  metronomeCustomerId: string | null;
  workOSOrganizationId?: string | null;
  groups?: string[];
};

export type WorkspaceType = LightWorkspaceType & {
  ssoEnforced?: boolean;
};

export type UserType = {
  sId: string;
  id: number;
  createdAt: number;
  provider: "auth0" | "github" | "google" | "okta" | "samlp" | "waad" | null;
  username: string;
  email: string;
  firstName: string;
  lastName: string | null;
  fullName: string;
  image: string | null;
  lastLoginAt: number | null;
};
