import { Sequelize } from "sequelize";

const { FRONT_DATABASE_URI, XP1_DATABASE_URI } = process.env;

export const front_sequelize = new Sequelize(FRONT_DATABASE_URI as string, {
  pool: {
    // default is 5
    max: 10,
  },
  logging: false,
});
export const xp1_sequelize = new Sequelize(XP1_DATABASE_URI as string, {
  logging: false,
});

export type ModelId = number;
