import type { SkillAvailability } from "@app/types/assistant/skill_configuration";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const SKILL_AVAILABILITY_DISPLAY: Record<
  SkillAvailability,
  {
    label: MessageDescriptor;
    color: "primary" | "success" | "highlight";
    tooltip: MessageDescriptor;
  }
> = {
  editors: {
    label: msg`Editors only`,
    color: "primary",
    tooltip: msg`Only editors can find it via the composer and agent builder`,
  },
  workspace_users: {
    label: msg`Members`,
    color: "success",
    tooltip: msg`All members can find it via the composer and agent builder`,
  },
  users_and_agents: {
    label: msg`Members and agents`,
    color: "highlight",
    tooltip: msg`Available to all members and agents with Discover Skills`,
  },
};
