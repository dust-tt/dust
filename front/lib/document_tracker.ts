import { CoreAPI } from "@dust-tt/types";
import { literal, Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { TrackedDocument } from "@app/lib/models/doc_tracker";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import logger from "@app/logger/logger";

import config from "./api/config";

export async function updateTrackedDocuments(
  dataSourceId: number,
  documentId: string,
  documentContent: string
) {
  const dataSource = await DataSourceResource.fetchByModelId(dataSourceId);
  if (!dataSource) {
    throw new Error(`Could not find data source with id ${dataSourceId}`);
  }
  if (!dataSource.workspaceId) {
    throw new Error(
      `Data source with id ${dataSourceId} has no workspace id set`
    );
  }
  const workspaceModel = await Workspace.findByPk(dataSource.workspaceId);
  if (!workspaceModel) {
    throw new Error(
      `Could not find workspace with id ${dataSource.workspaceId}`
    );
  }
  const auth = await Authenticator.internalBuilderForWorkspace(
    workspaceModel.sId
  );
  const owner = auth.workspace();
  if (!owner) {
    throw new Error(
      `Could not find workspace with id ${dataSource.workspaceId}`
    );
  }

  const hasExistingTrackedDocs = !!(await TrackedDocument.count({
    where: {
      dataSourceId: dataSource.id,
      documentId,
    },
  }));

  const emailPattern = "\\S+@\\S+\\.\\S+";
  const emailRegex = new RegExp(emailPattern);

  // Match any DUST_TRACK tag, regardless of its content
  const dustTrackTagRegex = /DUST_TRACK\(\s*(.*?)\)/g;

  const dustTrackTags = documentContent.match(dustTrackTagRegex) || [];

  const allEmails: Set<string> = new Set();
  for (const dustTrackTag of dustTrackTags) {
    // remove 'DUST_TRACK(' and ')' from the tag
    const emailsInTag = dustTrackTag
      .replace(/DUST_TRACK\(/, "")
      .replace(/\)/, "");

    // split emails by comma, map over them to remove any trailing or leading spaces, and validate
    const emails = emailsInTag
      .split(",")
      .map((email) => email.trim().toLowerCase());
    for (const email of emails) {
      // only add the email if it's valid
      if (emailRegex.test(email)) {
        allEmails.add(email);
      } else {
        // log invalid email
        logger.warn(
          {
            email,
            dataSourceId,
            documentId,
          },
          "Invalid email in DUST_TRACK tag"
        );
      }
    }
  }

  // find users with matching emails
  const emails = Array.from(allEmails);
  let users = emails.length
    ? await User.findAll({
        where: literal(`lower(email) IN (:emails)`),
        replacements: {
          emails,
        },
      })
    : [];

  // restrict to users in the workspace
  const memberships = await MembershipResource.getActiveMemberships({
    workspace: owner,
  });
  const userIdsInWorkspace = new Set(
    memberships.map((membership) => membership.userId)
  );
  users = users.filter((user) => userIdsInWorkspace.has(user.id));

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
  const hasRemainingTrackedDocs = !!(await TrackedDocument.count({
    where: {
      dataSourceId: dataSource.id,
      documentId,
    },
  }));

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  if (hasExistingTrackedDocs && !hasRemainingTrackedDocs) {
    await coreAPI.updateDataSourceDocumentTags({
      projectId: dataSource.dustAPIProjectId,
      dataSourceName: dataSource.name,
      removeTags: ["__DUST_TRACKED"],
      documentId,
    });
  } else if (!hasExistingTrackedDocs && hasRemainingTrackedDocs) {
    await coreAPI.updateDataSourceDocumentTags({
      projectId: dataSource.dustAPIProjectId,
      dataSourceName: dataSource.name,
      addTags: ["__DUST_TRACKED"],
      documentId,
    });
  }
}
