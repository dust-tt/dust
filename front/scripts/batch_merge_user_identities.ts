import { promises as fs } from "fs";

import { Authenticator } from "@app/lib/auth";
import { mergeUserIdentities } from "@app/lib/iam/users";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { makeScript } from "./helpers";

interface MergeRecord {
  email: string;
  sIdToKeep: string;
}

async function parseMergeFile(filePath: string): Promise<MergeRecord[]> {
  const content = await fs.readFile(filePath, "utf-8");

  const data = JSON.parse(content);
  if (!Array.isArray(data)) {
    throw new Error("File content must be an array of merge records");
  }

  // Validate the structure
  for (const record of data) {
    if (!record.email || !record.sIdToKeep) {
      throw new Error("Each record must have email and sIdToKeep");
    }
  }

  return data;
}

// JSON file example:
// [
//   {
//     "email": "user@example.com",
//     "sIdToKeep": "user-123"
//   },
//   {
//     "email": "another@example.com",
//     "sIdToKeep": "user-999"
//   }
// ]

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe: "Workspace ID to merge users in",
      type: "string" as const,
      demandOption: true,
    },
    file: {
      alias: "f",
      describe: "Path to JSON file containing merge specifications",
      type: "string" as const,
      demandOption: true,
    },
  },
  async ({ workspaceId, file, execute }, logger) => {
    const workspace = await WorkspaceResource.fetchByModelId(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }

    logger.info({ workspaceId, workspace: workspace.name }, "Found workspace");

    // Parse the merge file
    const mergeRecords = await parseMergeFile(file);
    logger.info({ recordCount: mergeRecords.length }, "Loaded merge records");

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const results = {
      successful: [] as Array<{ primary: string; secondary: string }>,
      failed: [] as Array<{
        primary: string;
        secondary: string;
        error: string;
      }>,
    };

    for (const record of mergeRecords) {
      // Fetch all users with this email
      const usersWithEmail = await UserResource.listByEmail(record.email);

      if (usersWithEmail.length === 0) {
        logger.error(
          {
            email: record.email,
          },
          "No users found with email"
        );
        results.failed.push({
          primary: record.sIdToKeep,
          secondary: "unknown",
          error: `No users found with email ${record.email}`,
        });
        continue;
      }

      if (usersWithEmail.length === 1) {
        logger.info(
          {
            email: record.email,
            userId: usersWithEmail[0].sId,
          },
          "Only one user found with this email, skipping"
        );
        continue;
      }

      // Find the user to keep
      const primaryUser = usersWithEmail.find(
        (u) => u.sId === record.sIdToKeep
      );
      if (!primaryUser) {
        logger.error(
          {
            email: record.email,
            sIdToKeep: record.sIdToKeep,
          },
          "User with sId not found for email"
        );
        results.failed.push({
          primary: record.sIdToKeep,
          secondary: "unknown",
          error: `User with sId ${record.sIdToKeep} not found for email ${record.email}`,
        });
        continue;
      }

      // Get secondary users (all others)
      const secondaryUsers = usersWithEmail.filter(
        (u) => u.sId !== record.sIdToKeep
      );

      if (secondaryUsers.length > 1) {
        logger.error(
          {
            email: record.email,
            secondaryCount: secondaryUsers.length,
            secondaryIds: secondaryUsers.map((u) => u.sId),
          },
          "More than one secondary user found"
        );
        results.failed.push({
          primary: record.sIdToKeep,
          secondary: secondaryUsers.map((u) => u.sId).join(", "),
          error: `More than one secondary user found for email ${record.email}. Found ${secondaryUsers.length} secondary users: ${secondaryUsers.map((u) => u.sId).join(", ")}`,
        });
        continue;
      }

      const secondaryUser = secondaryUsers[0];

      logger.info(
        {
          email: record.email,
          primaryUserId: primaryUser.sId,
          secondaryUserId: secondaryUser.sId,
        },
        "Processing merge record"
      );

      logger.info(
        {
          primaryUserId: primaryUser.sId,
          primaryEmail: primaryUser.email,
          secondaryUserId: secondaryUser.sId,
          secondaryEmail: secondaryUser.email,
        },
        !execute ? "Would merge users" : "Merging users"
      );

      if (execute) {
        let result;
        try {
          result = await mergeUserIdentities({
            auth,
            primaryUserId: primaryUser.sId,
            secondaryUserId: secondaryUser.sId,
            enforceEmailMatch: true, // Always enforce email match
            revokeSecondaryUser: true, // Always revoke secondary user
          });
        } catch (error) {
          const normalizedError = normalizeError(error);
          logger.error(
            {
              primaryUserId: primaryUser.sId,
              secondaryUserId: secondaryUser.sId,
              error: normalizedError,
            },
            "Exception during merge"
          );
          results.failed.push({
            primary: primaryUser.sId,
            secondary: secondaryUser.sId,
            error: normalizedError.message,
          });
          continue;
        }

        if (result.isErr()) {
          logger.error(
            {
              primaryUserId: primaryUser.sId,
              secondaryUserId: secondaryUser.sId,
              error: result.error,
            },
            "Failed to merge users"
          );
          results.failed.push({
            primary: primaryUser.sId,
            secondary: secondaryUser.sId,
            error: result.error.message,
          });
          continue;
        }

        logger.info(
          {
            primaryUserId: primaryUser.sId,
            secondaryUserId: secondaryUser.sId,
          },
          "Successfully merged users"
        );
      }

      results.successful.push({
        primary: primaryUser.sId,
        secondary: secondaryUser.sId,
      });
    }

    // Summary
    logger.info(
      {
        successful: results.successful.length,
        failed: results.failed.length,
        execute,
      },
      "Batch merge complete"
    );

    if (results.failed.length > 0) {
      logger.error({ failures: results.failed }, "Failed merges");
    }

    // Write results to file
    const resultsFile = `merge_results_${new Date().toISOString().replace(/:/g, "-")}.json`;
    await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
    logger.info({ resultsFile }, "Results written to file");
  }
);
