import type { ConsumptionBreakdownDimension } from "@app/lib/api/analytics/consumption/series";
import { sourceLabelForOrigin } from "@app/lib/api/analytics/source_labels";
import {
  resolveAnalyticsAgentLabels,
  UNKNOWN_AGENT_LABEL,
} from "@app/lib/api/assistant/observability/agent_labels";
import { getUserDisplayName } from "@app/lib/api/assistant/observability/credit_labels";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { asDisplayToolName } from "@app/types/shared/utils/string_utils";

/**
 * Display names for the keys a breakdown produces.
 *
 * The keys come straight out of the index — agent sIds, raw model ids, origin
 * slugs — and mean nothing in a chart legend. Every dimension resolves its whole
 * key list in one go rather than per key, so a breakdown stays one lookup wide
 * whatever the group count.
 *
 * Keys that cannot be resolved keep their raw value: an agent or a model can
 * leave the workspace while its consumption stays indexed, and a series that
 * disappears is worse than one labelled with an id.
 */
export async function resolveConsumptionGroupNames(
  auth: Authenticator,
  dimension: ConsumptionBreakdownDimension,
  groupKeys: string[]
): Promise<Map<string, string>> {
  if (groupKeys.length === 0) {
    return new Map();
  }

  switch (dimension) {
    case "agent": {
      const labels = await resolveAnalyticsAgentLabels(auth, groupKeys);
      return new Map(
        groupKeys.map((key) => [
          key,
          (labels.get(key) ?? UNKNOWN_AGENT_LABEL).name,
        ])
      );
    }

    case "user": {
      const users = await UserResource.fetchByIds(groupKeys);
      const usersById = new Map(users.map((user) => [user.sId, user]));
      return new Map(
        groupKeys.map((key) => [key, getUserDisplayName(usersById.get(key))])
      );
    }

    case "model":
      return new Map(
        groupKeys.map((key) => [
          key,
          getModelConfigByModelId(key)?.displayName ?? key,
        ])
      );

    case "tool":
      // The key is the MCP server name, which already reads well enough on its
      // own when the display mapping has nothing for it.
      return new Map(
        groupKeys.map((key) => [key, asDisplayToolName(key) || key])
      );

    case "skill": {
      const skills = await SkillResource.fetchByIds(auth, groupKeys);
      const namesById = new Map(skills.map((skill) => [skill.sId, skill.name]));
      return new Map(groupKeys.map((key) => [key, namesById.get(key) ?? key]));
    }

    case "source":
      return new Map(
        groupKeys.map((key) => [key, sourceLabelForOrigin(key) ?? key])
      );

    default:
      assertNever(dimension);
  }
}
