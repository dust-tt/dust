import { Op } from "sequelize";

import type { User } from "@app/lib/models";
import { Membership } from "@app/lib/models";

export async function getActiveMembershipsForUser(userId: User["id"]) {
  return Membership.findAll({
    where: {
      userId,
      role: {
        [Op.ne]: "revoked",
      },
    },
  });
}
