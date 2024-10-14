import _ from "lodash";
import { Op } from "sequelize";

import { AgentUserRelation } from "@app/lib/models/assistant/agent";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  // table is ~234K rows at the time of writing
  let lastSeenId = 0;
  do {
    const relations = await AgentUserRelation.findAll({
      where: {
        id: {
          [Op.gt]: lastSeenId,
        },
      },
      order: [["id", "ASC"]],
      limit: 1000,
    });

    logger.info(
      `Processing ${relations.length} relations starting from ${lastSeenId}`
    );

    const relationChunks = _.chunk(relations, 16);

    for (const relationChunk of relationChunks) {
      await Promise.all(
        relationChunk.map((relation) => updateRelation(relation, execute))
      );
    }

    lastSeenId =
      relations.length === 0 ? -1 : relations[relations.length - 1].id;
  } while (lastSeenId !== -1);
});

async function updateRelation(relation: AgentUserRelation, execute: boolean) {
  if (execute) {
    // ~233K rows 'in-list' at the time of writing
    // @ts-expect-error column removed in a later migration
    if (relation.listStatusOverride === "in-list") {
      await relation.update({
        favorite: true,
      });
    }
    // ~461 rows 'not-in-list' at the time of writing
    // @ts-expect-error column removed in a later migration
    if (relation.listStatusOverride === "not-in-list") {
      await relation.destroy();
    }
  }
}
