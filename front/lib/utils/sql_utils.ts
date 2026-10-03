import { frontSequelize } from "@app/lib/resources/storage";
import logger from "@app/logger/logger";
import type { Transaction } from "sequelize";
import { DatabaseError, Sequelize, UniqueConstraintError } from "sequelize";
import { injectReplacements } from "sequelize/lib/utils/sql";

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

function getCurrentTransaction(): Transaction | null {
  // We use CLS in tests to isolate tests in separate transactions.
  // Transactions are created in the global beforeEach and used implicitely by Sequelize thanks to CLS.
  // This return the current transaction in CLS.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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

const DEADLOCK_DETECTED = "40P01";

const TRANSACTION_MAX_ATTEMPTS = 3;

function getPostgresErrorCode(err: DatabaseError): string | null {
  const { parent } = err;

  if ("code" in parent && typeof parent.code === "string") {
    return parent.code;
  }

  return null;
}

/**
 * Two writers raced for the same slot (unique violation) or their row locks interleaved
 * (deadlock). Both clear on a fresh attempt: the loser rolled back, so it re-reads the state the
 * winner committed.
 *
 * `UniqueConstraintError` is a `ValidationError`, not a `DatabaseError`, hence the two branches.
 */
export function isWriteConflictError(err: unknown): boolean {
  if (err instanceof UniqueConstraintError) {
    return true;
  }

  return (
    err instanceof DatabaseError &&
    getPostgresErrorCode(err) === DEADLOCK_DETECTED
  );
}

export async function retryOnWriteConflict<T>(
  run: () => Promise<T>
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= TRANSACTION_MAX_ATTEMPTS || !isWriteConflictError(err)) {
        throw err;
      }

      logger.warn(
        { attempt, maxAttempts: TRANSACTION_MAX_ATTEMPTS, err },
        "Transaction hit a write conflict, retrying."
      );
    }
  }
}

/**
 * `withTransaction`, re-running the closure when a write conflict rolls it back.
 *
 * Retries only when this call opened the transaction. A transaction passed in is already aborted by
 * the failed statement, so replaying `fn` on it would just add "current transaction is aborted"
 * errors; whoever opened it retries instead.
 *
 * `fn` restarts from scratch, so it has to read whatever it derives its writes from, and leave side
 * effects on `transaction.afterCommit`.
 */
export async function withRetriedTransaction<T>(
  fn: (transaction: Transaction) => Promise<T>,
  transaction?: Transaction
): Promise<T> {
  if (transaction || getCurrentTransaction()) {
    return withTransaction(fn, transaction);
  }

  return retryOnWriteConflict(() => withTransaction(fn));
}
