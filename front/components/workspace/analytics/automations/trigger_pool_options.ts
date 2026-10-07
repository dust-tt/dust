import type { TriggerExecutionMode } from "@app/types/assistant/triggers";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const POOL_OPTIONS: {
  value: TriggerExecutionMode;
  label: MessageDescriptor;
}[] = [
  { value: "workspace_pool", label: msg`Workspace` },
  { value: "user_pool", label: msg`Member` },
];

export const EXECUTION_MODE_UNAVAILABLE_MESSAGES: Record<
  TriggerExecutionMode,
  MessageDescriptor
> = {
  user_pool: msg`Your plan doesn't support charging automations to personal credits.`,
  workspace_pool: msg`You don't have permission to charge automations to the workspace credit pool.`,
};
