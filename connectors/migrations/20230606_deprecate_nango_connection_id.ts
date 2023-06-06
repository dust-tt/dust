import { Op } from "sequelize";

import { Connector, sequelize_conn } from "@connectors/lib/models";

async function main() {
  await Connector.update(
    {
      connectionId: sequelize_conn.col("nangoConnectionId"),
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
