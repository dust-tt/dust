import type { GroupType } from "@app/types";
import {
  AGENT_GROUP_PREFIX,
  GLOBAL_SPACE_NAME,
  SPACE_GROUP_PREFIX,
} from "@app/types";

export const prettifyGroupName = (group: GroupType) => {
  if (group.kind === "global") {
    return GLOBAL_SPACE_NAME;
  }

  return group.kind === "agent_editors"
    ? group.name.replace(AGENT_GROUP_PREFIX, "")
    : group.name.replace(SPACE_GROUP_PREFIX, "");
};
