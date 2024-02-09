import { Op } from "sequelize";

import { Connector } from "@connectors/lib/models";
import { sequelizeConnection } from "@connectors/resources/storage";

async function main() {
  await Connector.update(
    {
      connectionId: sequelizeConnection.col("nangoConnectionId"),
    },
    {
      // @ts-expect-error `connectionId` has been made non-nullable
      where: {
        connectionId: {
          [Op.eq]: null,
        },
      },
    }
  );
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
