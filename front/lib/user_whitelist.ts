import { Op } from "sequelize";

import { Membership, User } from "./models";

export async function isUserWhiteListed(workspaceId: number): Promise<boolean> {
  const WHITE_LISTED_EMAILS = [
    // Email account given by Google for the Google App verification process.
    "oauthtest121@gmail.com",
  ];
  const u = await User.count({
    where: {
      email: {
        [Op.in]: WHITE_LISTED_EMAILS,
      },
    },
    include: [
      {
        model: Membership,
        required: true,
        where: {
          workspaceId: workspaceId,
        },
      },
    ],
  });

  return u > 0;
}
