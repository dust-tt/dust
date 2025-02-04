import * as _ from "lodash";

import { UserModel } from "@app/lib/resources/storage/models/user";
import { UserResource } from "@app/lib/resources/user_resource";
import { CustomerioServerSideTracking } from "@app/lib/tracking/customerio/server";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const backfillCustomerIo = async (execute: boolean) => {
  const allUserModels = await UserModel.findAll();
  const users = allUserModels.map((u) => u);
  const chunks = _.chunk(users, 16);
  for (const [i, c] of chunks.entries()) {
    logger.info(
      `[execute=${execute}] Processing chunk of ${c.length} users... (${
        i + 1
      }/${chunks.length})`
    );
    if (execute) {
      await Promise.all(
        c.map((u) =>
          (async () => {
            try {
              const user = await UserResource.fetchByModelId(u.id);
              if (!user) {
                logger.error(
                  { userId: u.sId },
                  "Failed to fetch userResource, skipping"
                );
                return;
              }
              return await Promise.all([
                CustomerioServerSideTracking.backfillUser({
                  user: user.toJSON(),
                }).catch((err) => {
                  logger.error(
                    { userId: user.sId, err },
                    "Failed to backfill user on Customer.io"
                  );
                }),
              ]);
            } catch (err) {
              logger.error(
                { userId: u.sId, err },
                "Failed to fetch userResource"
              );
            }
          })()
        )
      );
    }
  }
};

makeScript({}, async ({ execute }) => {
  await backfillCustomerIo(execute);
});
