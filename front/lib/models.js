const { Sequelize, DataTypes } = require("sequelize");

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "front_store.sqlite",
});

export const User = sequelize.define(
  "user",
  {
    github_id: {
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

export const Apps = sequelize.define(
  "app",
  {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    visibility: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
    },
    dust_project: {
      type: DataTypes.TEXT,
    },
  },
  {}
);
User.hasMany(Apps);

export const Providers = sequelize.define(
  "provider",
  {
    name: {
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
User.hasMany(Providers);
