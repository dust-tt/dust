import { injectReplacements } from "sequelize/lib/utils/sql";

import { frontSequelize } from "@app/lib/resources/storage";

export function getInsertSQL(model: any, data: any) {
  // Build an instance but don't save it
  const instance = model.build(data);

  // Get the QueryGenerator for this dialect
  const queryGenerator = model.sequelize.getQueryInterface().queryGenerator;

  // Get the table name and attributes
  const tableName = model.tableName;
  const values = instance.get({ plain: true });

  // Use the internal insertQuery method
  // This generates the SQL without executing it
  const parameterizedQuery = queryGenerator.insertQuery(
    tableName,
    values,
    model.rawAttributes,
    {}
  );

  // For PostgreSQL, use the bind method from Sequelize Utils
  if (parameterizedQuery.query && parameterizedQuery.bind) {
    // Use the format method to bind parameters
    // This is the proper way to use Sequelize's internal binding
    return injectReplacements(
      parameterizedQuery.query.replace(/\$\d+/g, "?"),
      // @ts-expect-error I know there is a dialect
      frontSequelize.dialect,
      parameterizedQuery.bind
    );
  }
}
