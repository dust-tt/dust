import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import type { Users01 } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

// Kept apart from AgentDetailsBody so that importers (e.g. the agent search table) do not pull
// the lazily-loaded agent details body into their chunk.
export const SCOPE_INFO: Record<
  AgentConfigurationScope,
  {
    label: MessageDescriptor;
    color: "success" | "info" | "highlight" | "primary";
    icon?: typeof Users01 | undefined;
    text: MessageDescriptor;
  }
> = {
  global: {
    label: msg`Default agent`,
    color: "primary",
    text: msg`Default agents provided by Dust.`,
  },
  hidden: {
    label: msg`Not published`,
    color: "primary",
    text: msg`Hidden agents.`,
  },
  visible: {
    label: msg`Published`,
    color: "success",
    text: msg`Visible agents.`,
  },
} as const;
