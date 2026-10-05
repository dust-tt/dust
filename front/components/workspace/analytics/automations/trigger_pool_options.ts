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
