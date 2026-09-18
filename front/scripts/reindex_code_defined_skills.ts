import { getClient, SKILL_SEARCH_ALIAS_NAME } from "@app/lib/api/elasticsearch";
import { GLOBAL_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/global";
import type { SkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { SYSTEM_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/system";
import { makeSkillDocumentId } from "@app/lib/skill_search";
import { CODE_DEFINED_SKILLS_WORKSPACE_ID } from "@app/lib/skill_search/constants";
import { makeScript } from "@app/scripts/helpers";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";

function toSkillSearchDocument(skill: SkillDefinition): SkillSearchDocument {
  return {
    workspace_id: CODE_DEFINED_SKILLS_WORKSPACE_ID,
    skill_id: skill.sId,
    status: "active",
    availability:
      skill.kind === "global" ? "users_and_agents" : "workspace_users",
    name: skill.name,
    description: skill.userFacingDescription,
    icon: skill.icon,
    last_edited_by_user_id: null,
    editor_ids: [],
    requested_space_ids: [],
    // Global documents cannot store workspace-specific tools or usage.
    mcp_server_view_ids: [],
    active_users_count: null,
    favorite_count: 0,
    // Definitions do not have creation or update timestamps.
    created_at: null,
    updated_at: null,
  };
}

makeScript({}, async ({ execute }, logger) => {
  const documents = [...GLOBAL_SKILLS_ARRAY, ...SYSTEM_SKILLS_ARRAY].map(
    toSkillSearchDocument
  );

  const skillIds = documents.map((document) => document.skill_id);
  logger.info({ execute, skillIds }, "Reindexing code-defined skills");

  if (!execute) {
    return;
  }

  const client = await getClient();
  if (documents.length > 0) {
    const result = await client.bulk({
      operations: documents.flatMap((document) => [
        {
          index: {
            _index: SKILL_SEARCH_ALIAS_NAME,
            _id: makeSkillDocumentId({
              workspaceId: document.workspace_id,
              skillId: document.skill_id,
            }),
          },
        },
        document,
      ]),
    });

    if (result.errors) {
      throw new Error(
        "Failed to index code-defined skills; obsolete documents were not deleted."
      );
    }
  }

  const deleted = await client.deleteByQuery({
    index: SKILL_SEARCH_ALIAS_NAME,
    query: {
      bool: {
        filter: [{ term: { workspace_id: CODE_DEFINED_SKILLS_WORKSPACE_ID } }],
        must_not: [{ terms: { skill_id: skillIds } }],
      },
    },
  });

  if (deleted.timed_out || deleted.failures?.length) {
    throw new Error("Failed to remove obsolete code-defined skill documents.");
  }

  logger.info(
    { indexed: documents.length, deleted: deleted.deleted },
    "Code-defined skill search index updated"
  );
});
