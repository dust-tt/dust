import { Op } from "sequelize";

import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { makeScript } from "@app/scripts/helpers";

/**
 * The previous migration only handled currently-active `builder` memberships.
 * This script flips the remaining rows: not-yet-started ones (`startAt` in the
 * future) and already-ended ones (`endAt` in the past).
 *
 * None of these rows are currently active, so their cached role is never
 * `builder` and no cache invalidation is needed.
 */

makeScript({}, async ({ execute }, logger) => {
  const now = new Date();

  const where = {
    role: "builder" as const,
    [Op.or]: [{ startAt: { [Op.gt]: now } }, { endAt: { [Op.lt]: now } }],
  };

  const builderMemberships = await MembershipModel.findAll({
    attributes: ["id", "userId", "workspaceId", "startAt", "endAt"],
    where,
  });

  if (builderMemberships.length === 0) {
    logger.info("No remaining builder memberships to migrate.");
    return;
  }

  if (!execute) {
    for (const m of builderMemberships) {
      logger.info(
        {
          membershipId: m.id,
          userModelId: m.userId,
          workspaceModelId: m.workspaceId,
          startAt: m.startAt,
          endAt: m.endAt,
        },
        "Would flip builder -> user (DB only)"
      );
    }
    logger.info(
      { total: builderMemberships.length },
      "Remaining builder -> user migration dry run complete"
    );
    return;
  }

  const [migrated] = await MembershipModel.update(
    { role: "user" },
    { where: { id: { [Op.in]: builderMemberships.map((m) => m.id) } } }
  );

  logger.info(
    { migrated, total: builderMemberships.length },
    "Remaining builder -> user migration complete"
  );
});
