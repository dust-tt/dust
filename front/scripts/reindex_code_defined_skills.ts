import { getClient, SKILL_SEARCH_ALIAS_NAME } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { makeSkillDocumentId } from "@app/lib/skill_search";
import { CODE_DEFINED_SKILLS_WORKSPACE_ID } from "@app/lib/skill_search/constants";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {},
  /**
   * @cc [owner:aubin-tchoi,label:backend;security] code-defined-search-reindex
   * Replace only documents in the reserved global workspace. Remove obsolete definitions
   * only after every current definition has been indexed successfully; dry runs must not write.
   */
  /**
   * @cc [owner:aubin-tchoi,label:error-handling] code-defined-reindex-script-failures
   * At this operator-script boundary, incomplete ES writes throw so makeScript logs the
   * failure and exits nonzero.
   */
  async ({ execute }, logger) => {
    const auth = Authenticator.unauthenticated();
    const skills = await SkillResource.dangerouslyListAllCodeDefined(auth);

    const documents = skills.map((skill) =>
      skill.toSearchDocument(auth, {
        editors: [],
        lastEditedByUser: null,
        activeUsersCount: null,
      })
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
          filter: [
            { term: { workspace_id: CODE_DEFINED_SKILLS_WORKSPACE_ID } },
          ],
          must_not: [{ terms: { skill_id: skillIds } }],
        },
      },
    });

    if (deleted.timed_out || deleted.failures?.length) {
      throw new Error(
        "Failed to remove obsolete code-defined skill documents."
      );
    }

    logger.info(
      { indexed: documents.length, deleted: deleted.deleted },
      "Code-defined skill search index updated"
    );
  }
);
