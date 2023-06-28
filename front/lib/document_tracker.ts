import { Op } from "sequelize";

import { TrackedDocument, User } from "@app/lib/models";
import logger from "@app/logger/logger";

export async function updateTrackedDocuments(
  dataSourceId: number,
  documentId: string,
  documentContent: string
) {
  const emailPattern = "\\S+@\\S+\\.\\S+";

  const dustTrackTagRegex = new RegExp(
    "DUST_TRACK\\(\\s*((?:" + emailPattern + "\\s*,?\\s*)+)\\)",
    "g"
  );

  const dustTrackTags = documentContent.match(dustTrackTagRegex);
  if (!dustTrackTags) {
    return;
  }
  const allEmails: Set<string> = new Set();
  for (const dustTrackTag of dustTrackTags) {
    // remove 'DUST_TRACK(' and ')' from the tag
    const emailsInTag = dustTrackTag
      .replace(/DUST_TRACK\(/, "")
      .replace(/\)/, "");

    // split emails by comma and map over them to remove any trailing or leading spaces
    const emails = emailsInTag
      .split(",")
      .map((email) => email.trim().toLowerCase());
    for (const email of emails) {
      allEmails.add(email);
    }
  }

  const emails = Array.from(allEmails);
  const users = await User.findAll({
    where: {
      email: {
        [Op.in]: emails,
      },
    },
  });
  const userByEmail: Map<string, User> = new Map();
  for (const user of users) {
    userByEmail.set(user.email.toLowerCase(), user);
  }
  const upsertTrackedDoc = async (email: string) => {
    const user = userByEmail.get(email);
    if (!user) {
      // TODO: email user to let them know they need to
      // sign up to dust before they can track docs
      logger.warn(
        {
          email,
          dataSourceId,
          documentId,
        },
        "User not found for tracked document"
      );
      return;
    }
    const exists = !!(await TrackedDocument.count({
      where: {
        dataSourceId,
        documentId,
        userId: user.id,
      },
    }));
    if (exists) {
      return;
    }
    logger.info(
      {
        email,
        dataSourceId,
        documentId,
      },
      "Creating tracked document"
    );
    await TrackedDocument.create({
      dataSourceId,
      documentId,
      userId: user.id,
      trackingEnabledAt: new Date(),
    });
  };

  // TODO: not very efficient
  await Promise.all(emails.map(upsertTrackedDoc));
  await TrackedDocument.destroy({
    where: {
      dataSourceId,
      documentId,
      userId: {
        [Op.notIn]: users.map((user) => user.id),
      },
    },
  });
}
