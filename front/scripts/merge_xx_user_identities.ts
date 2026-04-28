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
  },
  async ({ workspaceId, execute }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }

    logger.info({ workspaceId, name: workspace.name }, "Found workspace");

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const { members } = await getMembers(auth, { activeOnly: true });

    logger.info({ memberCount: members.length }, "Fetched workspace members");

    // Build a map email -> member for non-xx members.
    const primaryByEmail = new Map(
      members
        .filter((m) => {
          const [local] = m.email.split("@");
          return !local.endsWith("xx");
        })
        .map((m) => [m.email, m])
    );

    // Secondary users have a local part ending with "xx" (e.g. matteoxx@dust.tt).
    const xxMembers = members.filter((m) => {
      const [local] = m.email.split("@");
      return local.endsWith("xx");
    });

    logger.info(
      { xxMemberCount: xxMembers.length },
      "Found xx-suffixed members"
    );

    const results = {
      successful: [] as Array<{ primary: string; secondary: string }>,
      skipped: [] as Array<{ email: string; reason: string }>,
      failed: [] as Array<{
        primary: string;
        secondary: string;
        error: string;
      }>,
    };

    for (const secondaryMember of xxMembers) {
      // Strip the trailing "xx" from the local part to get the canonical email.
      const [local, domain] = secondaryMember.email.split("@");
      const canonicalEmail = `${local.slice(0, -2)}@${domain}`;
      const primaryMember = primaryByEmail.get(canonicalEmail);

      if (!primaryMember) {
        logger.info(
          { xxEmail: secondaryMember.email, canonicalEmail },
          "No matching primary member found, skipping"
        );
        results.skipped.push({
          email: secondaryMember.email,
          reason: `No primary member found for canonical email ${canonicalEmail}`,
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
