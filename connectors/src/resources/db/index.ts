import { Sequelize } from "sequelize";

import { dbConfig } from "@connectors/resources/db/config";

export const sequelizeConnection = new Sequelize(
  dbConfig.getRequiredDatabaseURI(),
  {
    logging: false,
  }
);
