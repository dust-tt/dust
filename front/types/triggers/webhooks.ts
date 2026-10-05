import type { GithubAdditionalData } from "@app/lib/triggers/built-in-webhooks/github/types";
import type { JiraAdditionalData } from "@app/lib/triggers/built-in-webhooks/jira/types";
import type { LinearAdditionalData } from "@app/lib/triggers/built-in-webhooks/linear/types";
import type { AgentsUsageType } from "@app/types/data_source";
import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/types/resources_icon_names";
import type { ModelId } from "@app/types/shared/model_id";
import type { EditedByUser } from "@app/types/user";

export type WebhookSourceSignatureAlgorithm = "sha1" | "sha256" | "sha512";

export type WebhookProvider =
  | "fathom"
  | "github"
  | "jira"
  | "linear"
  | "zendesk";

export type NoAdditionalData = {};

type WebhookProviderServiceDataMap = {
  fathom: NoAdditionalData;
  github: GithubAdditionalData;
  jira: JiraAdditionalData;
  linear: LinearAdditionalData;
  zendesk: NoAdditionalData;
};

export type WebhookServiceDataForProvider<P extends WebhookProvider> =
  WebhookProviderServiceDataMap[P];

export type GetServiceDataResponseType<
  P extends WebhookProvider = WebhookProvider,
> = {
  serviceData: WebhookServiceDataForProvider<P>;
};

export type WebhookSourceType = {
  id: ModelId;
  sId: string;
  name: string;
  provider: WebhookProvider | null;
  createdAt: number;
  updatedAt: number;
  subscribedEvents: string[];
};

export type WebhookSourceForAdminType = WebhookSourceType & {
  urlSecret: string;
  secret: string | null;
  signatureHeader: string | null;
  signatureAlgorithm: WebhookSourceSignatureAlgorithm | null;
  remoteMetadata: Record<string, any> | null;
  oauthConnectionId: string | null;
};

type BaseWebhookSourceViewType = {
  id: ModelId;
  sId: string;
  customName: string;
  description: string;
  icon: InternalAllowedIconType | CustomResourceIconType;
  provider: WebhookProvider | null;
  subscribedEvents: string[];
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  editedByUser: EditedByUser | null;
};

export type WebhookSourceViewType = BaseWebhookSourceViewType & {
  webhookSource: WebhookSourceType;
};

export type WebhookSourceViewForAdminType = BaseWebhookSourceViewType & {
  webhookSource: WebhookSourceForAdminType;
};

export type WebhookSourceWithViewsType = WebhookSourceForAdminType & {
  views: WebhookSourceViewForAdminType[];
};

export type WebhookSourceWithSystemViewType = WebhookSourceWithViewsType & {
  systemView: WebhookSourceViewForAdminType | null;
};

export type WebhookSourceWithViewsAndUsageType = WebhookSourceWithViewsType & {
  usage: AgentsUsageType | null;
};

export type WebhookSourceWithSystemViewAndUsageType =
  WebhookSourceWithSystemViewType & {
    usage: AgentsUsageType | null;
  };
