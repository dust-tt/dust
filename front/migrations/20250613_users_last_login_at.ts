import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import * as fs from "fs";
import * as readline from "readline";
import { concurrentExecutor } from "@app/lib/utils/async_utils";

interface LastLoginData {
  user_id: string;
  last_login: string;
}

const backfillLastLoginAt = async (execute: boolean, filePath: string) => {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const lastLoginMap = new Map<string, string>();
  for await (const line of rl) {
    const data: LastLoginData = JSON.parse(line);
    lastLoginMap.set(data.user_id, data.last_login);
  }

  logger.info(
    `Loaded ${lastLoginMap.size} last login records from ${filePath}`
  );

  // Process each auth0Sub
  await concurrentExecutor(
    Array.from(lastLoginMap.entries()),
    async ([auth0Sub, lastLoginStr]) => {
      if (!auth0Sub || !lastLoginStr) {
        logger.warn(
          `Skipping entry with missing auth0Sub or lastLogin: ${JSON.stringify({
            auth0Sub,
            lastLoginStr,
          })}`
        );
        return;
      }

      const lastLogin = new Date(lastLoginStr);
      if (isNaN(lastLogin.getTime())) {
        logger.warn(
          `Invalid lastLogin date for auth0Sub ${auth0Sub}: ${lastLoginStr}`
        );
        return;
      }
      const user = await UserResource.fetchByAuth0Sub(auth0Sub);
      if (!user) {
        logger.info({ auth0Sub }, "No user found for auth0Sub");
        return;
      }

      if (
        user.lastLoginAt &&
        user.lastLoginAt.getTime() >= lastLogin.getTime()
      ) {
        logger.info(
          `User ${user.auth0Sub} already has lastLoginAt set to ${user.lastLoginAt}, skipping`
        );
        return;
      }

      logger.info(
        `Backfilling user ${user.id} (${auth0Sub}) with lastLoginAt=${lastLogin.toISOString()} [execute: ${execute}]`
      );

      if (execute) {
        await user.recordLoginActivity(lastLogin);
      }
    },
    { concurrency: 16 }
  );
};

makeScript(
  {
    filePath: {
      type: "string",
      description: "Path to the JSONL file containing last login data",
      required: true,
    },
  },
  async ({ execute, filePath }) => {
    await backfillLastLoginAt(execute, filePath);
  }
);
