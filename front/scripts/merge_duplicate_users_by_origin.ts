import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { mergeUserIdentities } from "@app/lib/iam/users";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { UserTypeWithWorkspaces } from "@app/types/user";

import { makeScript } from "./helpers";

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe: "WorkspaceId to process",
      type: "string" as const,
      demandOption: true,
    },
    email: {
      describe: "Optional email to restrict processing to a single duplicate",
      type: "string" as const,
    },
    revokeSecondary: {
      describe: "Revoke the secondary (non-provisioned) user's membership",
      type: "boolean" as const,
      default: false,
    },
  },
  async ({ workspaceId, email, revokeSecondary, execute }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }

    logger.info({ workspaceId, name: workspace.name }, "Found workspace");

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const { members } = await getMembers(auth, { activeOnly: true });

    logger.info({ memberCount: members.length }, "Fetched workspace members");

    // Group members by email, so that each group holds the duplicate accounts sharing an email.
    const membersByEmail = new Map<string, UserTypeWithWorkspaces[]>();
    for (const member of members) {
      const key = member.email.toLowerCase();
      const group = membersByEmail.get(key);
      if (group) {
        group.push(member);
      } else {
        membersByEmail.set(key, [member]);
      }
    }

    let duplicateGroups = [...membersByEmail.entries()].filter(
      ([, group]) => group.length > 1
    );

    logger.info(
      { duplicateEmailCount: duplicateGroups.length },
      "Found emails with duplicate members"
    );

    if (email) {
      const target = email.toLowerCase();
      duplicateGroups = duplicateGroups.filter(([key]) => key === target);
      if (duplicateGroups.length === 0) {
        logger.error({ email }, "No duplicate members found for this email");
        return;
      }
      logger.info({ email }, "Filtered to single email");
    }

    const results = {
      successful: [] as Array<{ primary: string; secondary: string }>,
      skipped: [] as Array<{ email: string; reason: string }>,
      failed: [] as Array<{
        primary: string;
        secondary: string;
        error: string;
      }>,
    };

    for (const [duplicateEmail, group] of duplicateGroups) {
      const provisionedMembers = group.filter(
        (m) => m.origin === "provisioned"
      );

      // Only merge when exactly one of the duplicates is provisioned: it is the one to keep. If
      // none or several are provisioned, we have no way to pick a primary, so we leave it alone.
      if (provisionedMembers.length !== 1) {
        logger.info(
          {
            email: duplicateEmail,
            userIds: group.map((m) => m.sId),
            origins: group.map((m) => m.origin),
          },
          "Not exactly one provisioned member, skipping"
        );
        results.skipped.push({
          email: duplicateEmail,
          reason: `Found ${provisionedMembers.length} provisioned members out of ${group.length}`,
        });
        continue;
      }

      const primaryMember = provisionedMembers[0];
      const secondaryMembers = group.filter((m) => m.sId !== primaryMember.sId);

      for (const secondaryMember of secondaryMembers) {
        logger.info(
          {
            primaryUserId: primaryMember.sId,
            primaryEmail: primaryMember.email,
            secondaryUserId: secondaryMember.sId,
            secondaryEmail: secondaryMember.email,
            secondaryOrigin: secondaryMember.origin,
            revokeSecondary,
          },
          execute ? "Merging users" : "Would merge users"
        );

        if (!execute) {
          results.successful.push({
            primary: primaryMember.sId,
            secondary: secondaryMember.sId,
          });
          continue;
        }

        try {
          const result = await mergeUserIdentities({
            auth,
            primaryUserId: primaryMember.sId,
            secondaryUserId: secondaryMember.sId,
            // Emails already matched above, case-insensitively.
            enforceEmailMatch: false,
            revokeSecondaryUser: revokeSecondary,
          });

          if (result.isErr()) {
            logger.error(
              {
                primaryUserId: primaryMember.sId,
                secondaryUserId: secondaryMember.sId,
                error: result.error,
              },
              "Failed to merge users"
            );
            results.failed.push({
              primary: primaryMember.sId,
              secondary: secondaryMember.sId,
              error: result.error.message,
            });
            continue;
          }

          logger.info(
            {
              primaryUserId: primaryMember.sId,
              secondaryUserId: secondaryMember.sId,
            },
            "Successfully merged users"
          );

          results.successful.push({
            primary: primaryMember.sId,
            secondary: secondaryMember.sId,
          });
        } catch (error) {
          const normalizedError = normalizeError(error);
          logger.error(
            {
              primaryUserId: primaryMember.sId,
              secondaryUserId: secondaryMember.sId,
              error: normalizedError,
            },
            "Exception during merge"
          );
          results.failed.push({
            primary: primaryMember.sId,
            secondary: secondaryMember.sId,
            error: normalizedError.message,
          });
        }
      }
    }

    logger.info(
      {
        successful: results.successful.length,
        skipped: results.skipped.length,
        failed: results.failed.length,
        revokeSecondary,
        execute,
      },
      "Done"
    );

    if (results.skipped.length > 0) {
      logger.info({ skipped: results.skipped }, "Skipped merges");
    }

    if (results.failed.length > 0) {
      logger.error({ failures: results.failed }, "Failed merges");
    }
  }
);
