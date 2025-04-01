import { UserType, WorkspaceType } from "@dust-tt/client";

export interface ExtendedUserType extends UserType {
  workspaces: WorkspaceType[];
}
