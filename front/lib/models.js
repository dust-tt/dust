import { Sequelize, DataTypes } from "sequelize";

const { DATABASE_URI } = process.env;
const sequelize = new Sequelize(DATABASE_URI);

export const User = sequelize.define(
  "user",
  {
    githubId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    indexes: [{ fields: ["githubId"] }, { fields: ["username"] }],
  }
);

export const App = sequelize.define(
  "app",
  {
    uId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    savedSpecification: {
      type: DataTypes.TEXT,
    },
    savedConfig: {
      type: DataTypes.TEXT,
    },
    savedRun: {
      type: DataTypes.TEXT,
    },
    dustAPIProjectId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    indexes: [
      { fields: ["userId", "visibility"] },
      { fields: ["userId", "sId", "visibility"] },
    ],
  }
);
User.hasMany(App);

export const Provider = sequelize.define(
  "provider",
  {
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    config: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  { indexes: [{ fields: ["userId"] }] }
);
User.hasMany(Provider);

export const Dataset = sequelize.define(
  "dataset",
  {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
    },
  },
  {
    indexes: [{ fields: ["userId", "appId", "name"] }],
  }
);
User.hasMany(Dataset);
App.hasMany(Dataset);

export const Clone = sequelize.define(
  "clone",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    fromId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "apps",
        key: "id",
      },
    },
    toId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "apps",
        key: "id",
      },
    },
  },
  {}
);
Clone.belongsTo(App, { as: "from", foreignKey: "fromId" });
Clone.belongsTo(App, { as: "to", foreignKey: "toId" });

export const Keys = sequelize.define(
  "keys",
  {
    secret: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  { indexes: [{ unique: true, fields: ["secret"] }, { fields: ["userId"] }] }
);
User.hasMany(Keys);
