import { RoleType } from "@app/lib/auth";

export type WorkspaceType = {
  id: number,
  uId: string;
  sId: string;
  name: string;
  type: "personal" | "team";
  role: RoleType;
};

export type UserType = {
  id: number;
  provider: string;
  providerId: string;
  username: string;
  email: string;
  name: string;
  image: string | null;
  workspaces: WorkspaceType[];
};
