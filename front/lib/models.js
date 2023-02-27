import { Sequelize, DataTypes } from "sequelize";

const { FRONT_DATABASE_URI } = process.env;
const front_sequelize = new Sequelize(FRONT_DATABASE_URI);

export const User = front_sequelize.define(
  "user",
  {
    // provider: {
    //   type: DataTypes.STRING,
    // },
    // providerId: {
    //   type: DataTypes.STRING,
    // },
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
    indexes: [
      { fields: ["githubId"] },
      { fields: ["username"] },
      // { fields: ["provider", "providerId"] },
    ],
  }
);

export const App = front_sequelize.define(
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

export const Provider = front_sequelize.define(
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

export const Dataset = front_sequelize.define(
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

export const Clone = front_sequelize.define(
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

export const Key = front_sequelize.define(
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
User.hasMany(Key);

// XP1

const { XP1_DATABASE_URI } = process.env;
const xp1_sequelize = new Sequelize(XP1_DATABASE_URI);

export const XP1User = xp1_sequelize.define(
  "user",
  {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    stripeSubscription: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    stripeSubscriptionStatus: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    stripeSubscriptionItem: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    secret: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    indexes: [{ fields: ["secret"] }, { fields: ["stripeSubscription"] }],
  }
);

export const XP1Run = xp1_sequelize.define(
  "run",
  {
    dustUser: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dustAppId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dustRunId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    runStatus: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    promptTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    completionTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    indexes: [{ fields: ["userId"] }],
  }
);
XP1User.hasMany(XP1Run);
