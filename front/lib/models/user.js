const { Sequelize, DataTypes } = require("sequelize");

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "front_store.sqlite",
});

const DustUser = sequelize.define(
  "dust_user",
  {
    nextAuthUserId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    githubLogin: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {}
);
