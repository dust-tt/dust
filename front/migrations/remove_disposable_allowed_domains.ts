import { Op } from "sequelize";

import { Membership, User, Workspace } from "@app/lib/models";
import { isDisposableEmailDomain } from "@app/lib/utils/disposable_email_domains";
import { makeScript } from "@app/migrations/helpers";

makeScript({}, async ({ execute }) => {
  const workspaces = await Workspace.findAll({
    attributes: ["id", "allowedDomain"],
    where: {
      allowedDomain: {
        [Op.not]: null,
        [Op.ne]: "",
      },
    },
  });

  let updatedWorkspacesCount = 0;
  for (const workspace of workspaces) {
    if (!workspace.allowedDomain) {
      continue;
    }

    let newAllowedDomain = null;

    // We first check if the domain is disposable,
    // If yes, then we remove it.
    if (isDisposableEmailDomain(workspace.allowedDomain)) {
      newAllowedDomain = null;
    } else {
      // If no, then we ensure that this domain belongs to their google workspace.
      const firstAdminUser = await User.findOne({
        include: {
          model: Membership,
          attributes: [], // Exclude Membership attributes from the final result.
          where: {
            role: "admin",
            workspaceId: workspace.id,
          },
          required: true, //  /!\ Needed to ensure we retrieve users from the provided workspaceId!
        },
        where: {
          provider: "google",
        },
        order: [["createdAt", "ASC"]], // Use ASC for the earliest signup.
        limit: 1,
      });

      if (!firstAdminUser) {
        console.error(
          `Not first admin found for workspace ${workspace.id} -- Skipping.`
        );
        continue;
      }

      const [, adminEmailDomain] = firstAdminUser.email.split("@");
      if (isDisposableEmailDomain(adminEmailDomain)) {
        newAllowedDomain = null;
      } else {
        newAllowedDomain = adminEmailDomain;
      }

      console.log(
        `>> About to update workspace allowedDomain from ${workspace.allowedDomain} to ${newAllowedDomain} for workspace Id ${workspace.id}:`,
        workspace.allowedDomain === newAllowedDomain ? "[SAME]" : "[DIFFERENT]"
      );

      const isSameEmailDomain = workspace.allowedDomain === newAllowedDomain;
      if (isSameEmailDomain) {
        continue;
      }

      if (execute) {
        workspace.allowedDomain = newAllowedDomain;
        await workspace.save();
      }
      updatedWorkspacesCount++;
    }
  }

  console.log(`Updated allowedDomain on ${updatedWorkspacesCount} workspaces.`);
});
