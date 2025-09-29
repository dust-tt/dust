import type { Transaction } from "sequelize";
import { Sequelize } from "sequelize";
import { injectReplacements } from "sequelize/lib/utils/sql";

import { frontSequelize } from "@app/lib/resources/storage";

function getInsertSQL(model: any, data: any) {
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

function getCurrentTransaction(): Transaction | null {
  // We use CLS in tests to isolate tests in separate transactions.
  // Transactions are created in the global beforeEach and used implicitely by Sequelize thanks to CLS.
  // This return the current transaction in CLS.
  return (Sequelize as any)._cls?.get("transaction") || null;
}

export async function withTransaction<T>(
  fn: (transaction: Transaction) => Promise<T>,
  transaction?: Transaction
): Promise<T> {
  if (transaction) {
    return fn(transaction);
  }

  // Check if there's already a transaction in CLS (see above).
  const clsTransaction = getCurrentTransaction();
  if (clsTransaction) {
    return fn(clsTransaction);
  }

  // Create new transaction if no transaction in CLS.
  if (process.env.NODE_ENV === "test") {
    throw new Error(
      "No transaction provided and no transaction in CLS while running tests, this should not happen."
    );
  }

  return frontSequelize.transaction(fn);
}
