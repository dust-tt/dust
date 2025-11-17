import type { Transaction } from "sequelize";
import { Sequelize } from "sequelize";

import { connectorsSequelize } from "@connectors/resources/storage";

function getCurrentTransaction(): Transaction | null {
  // We use CLS in tests to isolate tests in separate transactions.
  // Transactions are created in the global beforeEach and used implicitely by Sequelize thanks to CLS.
  // This return the current transaction in CLS.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  return connectorsSequelize.transaction(fn);
}
