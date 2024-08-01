import { GroupType } from "./groups";
import { LightWorkspaceType } from "./user";

// Authenticator is a concept that lives in front,
// but it's used when doing api calls to other services.
// This interface is a cheap way to represent the concept of an authenticator within types.
export interface BaseAuthenticator {
  groups: () => GroupType[];

  getNonNullableWorkspace: () => LightWorkspaceType;
}
