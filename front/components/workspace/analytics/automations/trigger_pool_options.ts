import type { TriggerExecutionMode } from "@app/types/assistant/triggers";

export const POOL_OPTIONS: { value: TriggerExecutionMode; label: string }[] = [
  { value: "workspace_pool", label: "Workspace" },
  { value: "user_pool", label: "Member" },
];
