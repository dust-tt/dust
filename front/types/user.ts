import { RoleType } from "@app/lib/auth";
import { ModelId } from "@app/lib/databases";

export type WorkspaceType = {
  id: ModelId;
  sId: string;
  name: string;
  allowedDomain: string | null;
  role: RoleType;
  plan: SubscribedPlanType;
  upgradedAt: number | null;
};

export type ManageDataSourcesLimitsType = {
  isSlackAllowed: boolean;
  isNotionAllowed: boolean;
  isGoogleDriveAllowed: boolean;
  isGithubAllowed: boolean;
};

export type SubscribedPlanType = {
  code: string;
  name: string;
  startDate: number;
  endDate: number | null;
  limits: {
    assistant: {
      isSlackBotAllowed: boolean;
      maxWeeklyMessages: number;
    };
    managedDataSources: ManageDataSourcesLimitsType;
    staticDataSources: {
      count: number;
      documents: {
        count: number;
        sizeMb: number;
      };
    };
    users: {
      maxUsers: number;
    };
  };
};

export type UserProviderType = "github" | "google";

export type UserType = {
  id: ModelId;
  provider: UserProviderType;
  providerId: string;
  username: string;
  email: string;
  name: string;
  image: string | null;
  workspaces: WorkspaceType[];
  isDustSuperUser: boolean;
};

export type UserMetadataType = {
  key: string;
  value: string;
};
