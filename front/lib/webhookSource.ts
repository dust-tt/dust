import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icon_names";
import {
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/components/resources/resources_icon_names";
import type {
  WebhookSourceForAdminType,
  WebhookSourceWithViewsType,
} from "@app/types/triggers/webhooks";

export const DEFAULT_WEBHOOK_ICON: InternalAllowedIconType =
  "ActionGlobeAltIcon" as const;

export const normalizeWebhookIcon = (
  icon: string | null | undefined
): InternalAllowedIconType | CustomResourceIconType => {
  if (!icon) {
    return DEFAULT_WEBHOOK_ICON;
  }

  if (isInternalAllowedIcon(icon) || isCustomResourceIconType(icon)) {
    return icon;
  }

  return DEFAULT_WEBHOOK_ICON;
};

export const filterWebhookSource = (
  webhookSource: WebhookSourceWithViewsType,
  filterValue: string
) => {
  {
    return (
      webhookSource.name.toLowerCase().includes(filterValue.toLowerCase()) ||
      webhookSource.views.some((view) =>
        view?.customName.toLowerCase().includes(filterValue.toLowerCase())
      ) ||
      (webhookSource.provider?.toLowerCase() ?? "custom").includes(
        filterValue.toLowerCase()
      )
    );
  }
};

export const buildWebhookUrl = ({
  apiBaseUrl,
  workspaceId,
  webhookSource,
}: {
  apiBaseUrl: string;
  workspaceId: string;
  webhookSource: WebhookSourceForAdminType;
}): string => {
  return `${apiBaseUrl}/api/v1/w/${workspaceId}/triggers/hooks/${webhookSource.sId}/${webhookSource.urlSecret}`;
};
