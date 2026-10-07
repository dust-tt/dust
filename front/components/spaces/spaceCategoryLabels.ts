import type { DataSourceViewCategory } from "@app/types/api/public/spaces";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const CATEGORY_LABELS: Record<
  DataSourceViewCategory,
  MessageDescriptor
> = {
  managed: msg`Connected data`,
  folder: msg`Folders`,
  website: msg`Websites`,
  apps: msg`Apps`,
  actions: msg`Tools`,
  triggers: msg`Triggers`,
};
