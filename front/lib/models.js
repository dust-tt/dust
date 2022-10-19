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
  {}
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
  {}
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
  {}
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
  {}
);
User.hasMany(Dataset);
App.hasMany(Dataset);
