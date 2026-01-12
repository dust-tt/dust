import type { GroupType } from "@app/types";
import {
  AGENT_GROUP_PREFIX,
  GLOBAL_SPACE_NAME,
  SKILL_GROUP_PREFIX,
  SPACE_GROUP_PREFIX,
} from "@app/types";

export const prettifyGroupName = (group: GroupType) => {
  if (group.kind === "global") {
    return GLOBAL_SPACE_NAME;
  }

  if (group.kind === "agent_editors") {
    return group.name.replace(AGENT_GROUP_PREFIX, "");
  }

  if (group.kind === "skill_editors") {
    return group.name.replace(SKILL_GROUP_PREFIX, "");
  }

  return group.name.replace(SPACE_GROUP_PREFIX, "");
};
