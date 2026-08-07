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
 * Resolve display names / labels for a set of keys for a given dimension.
 * The expected mapping is:
 * - "agent": agent sIds
 * - "user": user sIds
 * - "model": raw model ids
 * - "tool": MCP server names
 * - "skill": skill sIds
 * - "source": origin slugs
 */
export async function resolveDimensionLabels(
  auth: Authenticator,
  dimension: ConsumptionBreakdownDimension,
  keys: string[]
): Promise<Map<string, string>> {
  if (keys.length === 0) {
    return new Map();
  }

  switch (dimension) {
    case "agent": {
      const labels = await resolveAnalyticsAgentLabels(auth, keys);
      return new Map(
        keys.map((key) => [key, (labels.get(key) ?? UNKNOWN_AGENT_LABEL).name])
      );
    }

    case "user": {
      const users = await UserResource.fetchByIds(keys);
      const usersById = new Map(users.map((user) => [user.sId, user]));
      return new Map(
        keys.map((key) => [key, getUserDisplayName(usersById.get(key))])
      );
    }

    case "model":
      return new Map(
        keys.map((key) => [
          key,
          getModelConfigByModelId(key)?.displayName ?? key,
        ])
      );

    case "tool":
      // The key is the MCP server name, which already reads well enough on its
      // own when the display mapping has nothing for it.
      return new Map(keys.map((key) => [key, asDisplayToolName(key) || key]));

    case "skill": {
      const skills = await SkillResource.fetchByIds(auth, keys);
      const namesById = new Map(skills.map((skill) => [skill.sId, skill.name]));
      return new Map(keys.map((key) => [key, namesById.get(key) ?? key]));
    }

    case "source":
      return new Map(
        keys.map((key) => [key, sourceLabelForOrigin(key) ?? key])
      );

    default:
      assertNever(dimension);
  }
}
