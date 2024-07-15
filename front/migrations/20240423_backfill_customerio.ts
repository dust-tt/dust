import * as _ from "lodash";

import { User } from "@app/lib/models/user";
import { AmplitudeServerSideTracking } from "@app/lib/tracking/amplitude/server";
import { CustomerioServerSideTracking } from "@app/lib/tracking/customerio/server";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const backfillCustomerIo = async (execute: boolean) => {
  const allUserModels = await User.findAll();
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
          Promise.all([
            CustomerioServerSideTracking.backfillUser({
              user: u.toJSON(),
            }).catch((err) => {
              logger.error(
                { userId: u.sId, err },
                "Failed to backfill user on Customer.io"
              );
            }),
            // NOTE: this is unrelated to customerio, but leveraging this backfill
            // to also identify all users on Amplitude.
            AmplitudeServerSideTracking._identifyUser({
              user: {
                ...u.toJSON(),
                fullName: `${u.firstName} ${u.lastName}`,
                image: u.imageUrl,
                createdAt: u.createdAt.getTime(),
              },
            }),
          ])
        )
      );
    }
  }
};

makeScript({}, async ({ execute }) => {
  await backfillCustomerIo(execute);
});
