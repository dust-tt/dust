"use strict";

const noRawSqlRule = {
  meta: {
    type: "problem",
    docs: {
      description: "enfore no use of raw sql",
    },
    schema: [],
  },

  create: function (context) {
    // Keep track of variables that are Sequelize instances
    const sequelizeInstances = new Set();

    return {
      // Track variables assigned Sequelize instances
      VariableDeclarator(node) {
        if (node.init?.type === "CallExpression") {
          const functionName = node.init.callee.name;
          // Add known functions that return Sequelize instances
          if (functionName === "getFrontReplicaDbConnection") {
            sequelizeInstances.add(node.id.name);
          }
        }
      },

      // Check for query method calls
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property.name === "query"
        ) {
          const obj = node.callee.object;

          // Check if the object is a known Sequelize instance
          if (
            obj.type === "Identifier" &&
            // Known variable names
            (obj.name === "frontSequelize" ||
              // Variables we tracked that were assigned Sequelize instances
              sequelizeInstances.has(obj.name) ||
              // Pattern matching for *sequelize* names
              /sequelize/i.test(obj.name))
          ) {
            context.report({
              node,
              message:
                "Raw SQL queries are not allowed. Use Sequelize models and methods instead.",
            });
          }
        }
      },
    };
  },
};

module.exports = {
  meta: {
    name: "eslint-plugin-dust",
    version: "0.0.0",
  },
  rules: {
    "no-raw-sql": noRawSqlRule,
  },
};
