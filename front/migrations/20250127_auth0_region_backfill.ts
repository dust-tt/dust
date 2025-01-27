import type { ApiResponse } from "auth0";

import { getAuth0ManagemementClient } from "@app/lib/api/auth0";
import { SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { makeScript } from "@app/scripts/helpers";

const USERS_PER_PAGE = 100;
const THRESHOLD = 3;

makeScript(
  {
    defaultRegion: {
      type: "string",
      required: true,
      choices: SUPPORTED_REGIONS,
    },
  },
  async ({ defaultRegion, execute }, logger) => {
    const managementClient = getAuth0ManagemementClient();
    let count = 0;
    let remaining = 10;
    let resetTime = Date.now();

    const throttleAuth0 = async <T>(fn: () => Promise<ApiResponse<T>>) => {
      if (remaining < THRESHOLD) {
        const now = Date.now();
        const waitTime = resetTime * 1000 - now;
        logger.info({ waitTime }, "Waiting");
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }

      const res = await fn();
      if (res.status !== 200) {
        logger.error({ res }, "When calling Auth0");
        process.exit(1);
      }

      remaining = Number(res.headers.get("x-ratelimit-remaining"));
      resetTime = Number(res.headers.get("x-ratelimit-reset"));
      return res.data;
    };

    let hasMore = true;
    while (hasMore) {
      logger.info(`Getting the next ${USERS_PER_PAGE} users`);

      const users = await throttleAuth0(() =>
        managementClient.users.getAll({
          q: "NOT _exists_:app_metadata.region",
          per_page: USERS_PER_PAGE,
          page: 0,
        })
      );

      hasMore = users.length > 0;

      for (const user of users) {
        if (user.user_metadata?.region) {
          logger.info({ user: user.user_id }, "Region already set");
        } else {
          if (execute) {
            count++;
            logger.info({ user: user.user_id, count }, "Setting region");
            await throttleAuth0(() =>
              managementClient.users.update(
                {
                  id: user.user_id,
                },
                {
                  app_metadata: {
                    region: defaultRegion,
                  },
                }
              )
            );
          }
        }
      }
    }
    logger.info("No more users to process.");
  }
);
