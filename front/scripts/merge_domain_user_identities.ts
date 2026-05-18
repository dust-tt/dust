import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { mergeUserIdentities } from "@app/lib/iam/users";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { makeScript } from "./helpers";

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe: "WorkspaceId to process",
      type: "string" as const,
      demandOption: true,
    },
    oldDomain: {
      describe: "Old email domain (e.g. old.com) — secondary accounts",
      type: "string" as const,
      demandOption: true,
    },
    newDomain: {
      describe: "New email domain (e.g. new.com) — primary accounts",
      type: "string" as const,
      demandOption: true,
    },
    userId: {
      describe:
        "Optional sId of a single old-domain (secondary) user to process",
      type: "string" as const,
    },
  },
  async ({ workspaceId, oldDomain, newDomain, userId, execute }, logger) => {
    if (oldDomain === newDomain) {
      logger.error({ oldDomain, newDomain }, "Old and new domains must differ");
      return;
    }

    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }

    logger.info({ workspaceId, name: workspace.name }, "Found workspace");

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const { members } = await getMembers(auth, { activeOnly: true });

    logger.info({ memberCount: members.length }, "Fetched workspace members");

    // Build a map local -> member for new-domain members (primary accounts).
    const primaryByLocal = new Map(
      members
        .filter((m) => {
          const [, domain] = m.email.split("@");
          return domain === newDomain;
        })
        .map((m) => {
          const [local] = m.email.split("@");
          return [local, m];
        })
    );

    // Secondary users have an email on the old domain.
    let oldDomainMembers = members.filter((m) => {
      const [, domain] = m.email.split("@");
      return domain === oldDomain;
    });

    logger.info(
      { oldDomainMemberCount: oldDomainMembers.length },
      "Found old-domain members"
    );

    if (userId) {
      oldDomainMembers = oldDomainMembers.filter((m) => m.sId === userId);
      if (oldDomainMembers.length === 0) {
        logger.error(
          { userId, oldDomain },
          "No old-domain member found with the provided userId"
        );
        return;
      }
      logger.info({ userId }, "Filtered to single user");
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

    for (const secondaryMember of oldDomainMembers) {
      const [local] = secondaryMember.email.split("@");
      const newEmail = `${local}@${newDomain}`;
      const primaryMember = primaryByLocal.get(local);

      if (!primaryMember) {
        logger.info(
          { oldEmail: secondaryMember.email, newEmail },
          "No matching primary member found, skipping"
        );
        results.skipped.push({
          email: secondaryMember.email,
          reason: `No primary member found for new-domain email ${newEmail}`,
        });
        continue;
      }

      logger.info(
        {
          primaryUserId: primaryMember.sId,
          primaryEmail: primaryMember.email,
          secondaryUserId: secondaryMember.sId,
          secondaryEmail: secondaryMember.email,
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
          enforceEmailMatch: false,
          revokeSecondaryUser: true,
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

    logger.info(
      {
        successful: results.successful.length,
        skipped: results.skipped.length,
        failed: results.failed.length,
        execute,
      },
      "Done"
    );

    if (results.failed.length > 0) {
      logger.error({ failures: results.failed }, "Failed merges");
    }
  }
);
