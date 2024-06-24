import { Sequelize } from "sequelize";

import { dbConfig } from "@connectors/resources/storage/config";

export const sequelizeConnection = new Sequelize(
  dbConfig.getRequiredDatabaseURI(),
  {
    logging: false,
  }
);
