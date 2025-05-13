"use strict";

function toSnakeCase(str) {
  return str
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

const POSTGRES_INDEX_NAME_MAX_LENGTH = 63;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "enforce index name length limit for sequelize models",
    },
    schema: [],
  },
  create: function (context) {
    return {
      CallExpression(node) {
        // Check if it's a Model.init call
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property.name === "init" &&
          node.arguments.length >= 2 &&
          node.arguments[1].type === "ObjectExpression"
        ) {
          const options = node.arguments[1];
          const modelNameProp = options.properties.find(
            (p) => p.key.name === "modelName",
          );
          const indexesProp = options.properties.find(
            (p) => p.key.name === "indexes",
          );

          if (!modelNameProp || !indexesProp) return;

          const modelName = modelNameProp.value.value;
          const indexes = indexesProp.value.elements;

          indexes.forEach((index) => {
            if (index.type !== "ObjectExpression") return;

            // Skip if index has a name property
            const nameProp = index.properties.find(
              (p) => p.key.name === "name",
            );
            if (nameProp) {
              if (
                nameProp.value.value.length > POSTGRES_INDEX_NAME_MAX_LENGTH
              ) {
                context.report({
                  node: nameProp,
                  message: `index name '${nameProp.value.value}' exceeds ${POSTGRES_INDEX_NAME_MAX_LENGTH} characters. Which is PostgreSQL index name limit.`,
                });
              }
              return;
            }

            const fieldsProp = index.properties.find(
              (p) => p.key.name === "fields",
            );
            if (!fieldsProp) return;

            const fields = fieldsProp.value.elements;
            const fieldsStr = fields.map((f) => toSnakeCase(f.value)).join("_");
            const fullIndexName = `${modelName}s_${fieldsStr}`;

            if (fullIndexName.length > POSTGRES_INDEX_NAME_MAX_LENGTH) {
              context.report({
                node: index,
                message: `Default index name '${fullIndexName}' exceeds ${POSTGRES_INDEX_NAME_MAX_LENGTH} characters. Which is PostgreSQL index name limit.`,
              });
            }
          });
        }
      },
    };
  },
};
