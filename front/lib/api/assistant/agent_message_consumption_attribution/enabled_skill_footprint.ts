import { MAX_TOOL_DESCRIPTION_LENGTH } from "@app/lib/actions/mcp";
import { hideInternalConfiguration } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { applyToolSourceLoadingPolicy } from "@app/lib/actions/tool_loading";
import { tryGetPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { getEnableSkillIdFromOutputBlock } from "@app/lib/api/actions/servers/skill_management/rendering";
import { renderEnabledSkillUserMessageFromInstructions } from "@app/lib/api/assistant/skills_rendering";
import type { Authenticator } from "@app/lib/auth";
import { isToolDeferred } from "@app/lib/model_constructors/types/tool_search";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import { removeNulls } from "@app/types/shared/utils/general";
import type { JSONSchema7 as JSONSchema } from "json-schema";

const EMPTY_INPUT_SCHEMA: JSONSchema = {
  type: "object",
  properties: {},
  required: [],
};

export function getEnabledSkillIdsFromAction(
  action: AgentMCPActionWithOutputType
): string[] {
  return [
    ...new Set(
      removeNulls((action.output ?? []).map(getEnableSkillIdFromOutputBlock))
    ),
  ];
}

/**
 * Rebuilds the definitions contributed by one enabled skill from its persisted server views. The
 * agent loop can apply further context-dependent filtering when it lists tools, so these remain an
 * attribution estimate rather than a copy of a provider request.
 */
function enabledSkillToolDefinitions(
  skill: SkillResource
): AgentActionSpecification[] {
  const definitions: AgentActionSpecification[] = [];

  for (const configuration of skill.mcpServerConfigurations) {
    const serverName =
      configuration.serverNameOverride ??
      configuration.view.name ??
      configuration.view.getServerDisplayMetadata().name;
    const disabledToolNames = new Set(
      configuration.view.getToolPermissions
        .filter(({ enabled }) => !enabled)
        .map(({ toolName }) => toolName)
    );

    for (const tool of configuration.view.getServerTools()) {
      if (disabledToolNames.has(tool.name)) {
        continue;
      }

      const prefixedName = tryGetPrefixedToolName(serverName, tool.name);
      if (prefixedName.isErr()) {
        continue;
      }

      const inputSchema = tool.inputSchema ?? EMPTY_INPUT_SCHEMA;
      definitions.push(
        applyToolSourceLoadingPolicy(
          {
            name: prefixedName.value,
            description: tool.description.slice(0, MAX_TOOL_DESCRIPTION_LENGTH),
            inputSchema:
              configuration.view.internalMCPServerId === null
                ? inputSchema
                : hideInternalConfiguration(inputSchema),
            eager: tool.eager,
          },
          // Best-effort attribution treats definitions attached to the enabled skill as
          // skill-originated; unlike the live loop, it does not reconstruct cross-source deduping.
          { isFromSkillServer: true }
        )
      );
    }
  }

  return definitions.sort((left, right) => left.name.localeCompare(right.name));
}

function enabledSkillInputText(
  skill: SkillResource,
  { toolSearchEnabled }: { toolSearchEnabled: boolean }
): string {
  const instructionsMessage = renderEnabledSkillUserMessageFromInstructions({
    skill,
  });
  const instructionsText = instructionsMessage.content.flatMap((content) =>
    content.type === "text" ? [content.text] : []
  );
  const toolDefinitions = enabledSkillToolDefinitions(skill).filter(
    (tool) => !isToolDeferred(tool, toolSearchEnabled)
  );

  return [
    ...instructionsText,
    ...(toolDefinitions.length > 0
      ? [
          JSON.stringify(
            toolDefinitions.map(({ name, description, inputSchema }) => ({
              name,
              description,
              inputSchema,
            }))
          ),
        ]
      : []),
  ].join("\n");
}

/**
 * Resolves the additional model input caused by successful enable-skill actions. A normal action
 * has no entry. An enable-skill action contributes the instructions rendered as a user message and,
 * when the provider loads them eagerly, the definitions of the tools exposed by the skill.
 */
export async function getEnabledSkillInputTextByActionId(
  auth: Authenticator,
  actions: AgentMCPActionWithOutputType[],
  { toolSearchEnabled }: { toolSearchEnabled: boolean }
): Promise<ReadonlyMap<string, string>> {
  const enabledSkillIdsByAction = actions.map((action) => ({
    action,
    skillIds: getEnabledSkillIdsFromAction(action),
  }));
  const skillIds = [
    ...new Set(enabledSkillIdsByAction.flatMap(({ skillIds }) => skillIds)),
  ];
  if (skillIds.length === 0) {
    return new Map();
  }

  const skills = await SkillResource.fetchByIds(auth, skillIds);
  const inputTextBySkillId = new Map(
    skills.map((skill) => [
      skill.sId,
      enabledSkillInputText(skill, { toolSearchEnabled }),
    ])
  );

  return new Map(
    enabledSkillIdsByAction.flatMap(({ action, skillIds }) => {
      const inputTexts = skillIds.flatMap((skillId) => {
        const inputText = inputTextBySkillId.get(skillId);
        return inputText !== undefined ? [inputText] : [];
      });

      return inputTexts.length > 0
        ? [[action.sId, inputTexts.join("\n")] as const]
        : [];
    })
  );
}
