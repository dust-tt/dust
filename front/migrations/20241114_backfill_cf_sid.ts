import { Op } from "sequelize";

import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  let lastSeenId = 0;
  const batchSize = 1000;

  for (;;) {
    // Find content fragments without sId
    const contentFragments: ContentFragmentModel[] =
      await ContentFragmentModel.findAll({
        // @ts-expect-error -- sequelize type for sId is not nullable (it temporarily is in db)
        where: {
          id: {
            [Op.gt]: lastSeenId,
          },
          sId: {
            [Op.is]: null,
          },
        },
        order: [["id", "ASC"]],
        limit: batchSize,
      });

    if (contentFragments.length === 0) {
      break;
    }

    logger.info(
      `Processing ${contentFragments.length} content fragments starting from ID ${lastSeenId}`
    );

    if (execute) {
      await Promise.all(
        contentFragments.map(async (cf) => {
          const sId = generateRandomModelSId("cf");
          await cf.update({ sId });
          logger.info(
            {
              contentFragmentId: cf.id,
              sId,
            },
            "Updated content fragment with sId"
          );
        })
      );
    } else {
      logger.info(
        {
          lastSeenId,
          count: contentFragments.length,
        },
        "Dry run - would have updated content fragments with sIds"
      );
    }

    lastSeenId = contentFragments[contentFragments.length - 1].id;
  }
});
