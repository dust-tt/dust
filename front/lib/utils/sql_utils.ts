import config from "@app/lib/api/config";
import { frontSequelize } from "@app/lib/resources/storage";
import type { Result } from "@app/types/shared/result";
import type { Transaction, TransactionOptions } from "sequelize";
import { Sequelize } from "sequelize";
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

// PostgreSQL savepoints are ordered on one connection, not a tree. Keep the logical
// tree separately so effects still wait for every enclosing scope to commit.
const savepointParents = new WeakMap<Transaction, Transaction>();

/**
 * @cc [owner:aubin-tchoi,label:backend;concurrency] nested-savepoint-atomicity
 * Savepoints created by withTransaction must have distinct rollback boundaries;
 * inner rollback preserves earlier outer writes, and outer rollback undoes committed inner writes.
 */
export async function withTransaction<T>(
  fn: (transaction: Transaction) => Promise<T>,
  transaction?: Transaction,
  {
    useSavepoint = false,
    ...options
  }: Pick<TransactionOptions, "isolationLevel"> & {
    useSavepoint?: boolean;
  } = {}
): Promise<T> {
  // Check if there's already a transaction in CLS (see above).
  const parent = transaction ?? getCurrentTransaction();
  if (parent) {
    if (!useSavepoint) {
      return fn(parent);
    }
    // Sequelize v6 gives descendants the same ID and per-parent savepoint counters,
    // and overwrites parent.name on creation/rollback (sequelize/sequelize#18207).
    // Root-owned savepoints share one counter and never mutate an enclosing savepoint.
    let root = parent;
    while (root.parent) {
      root = root.parent;
    }
    return frontSequelize.transaction(
      { ...options, transaction: root },
      async (savepoint) => {
        savepointParents.set(savepoint, parent);
        return fn(savepoint);
      }
    );
  }

  // Create new transaction if no transaction in CLS.
  if (config.getDustAPIConfig().nodeEnv === "test") {
    throw new Error(
      "No transaction provided and no transaction in CLS while running tests, this should not happen."
    );
  }

  return frontSequelize.transaction(options, fn);
}

/**
 * @cc [owner:aubin-tchoi,label:backend;concurrency] error-results-rollback
 * A callback's Err result or thrown error rolls back this scope's writes and suppresses its commit
 * effects; an Ok result commits only this scope, leaving any caller transaction in control.
 */
export async function withTransactionResult<T extends Result<unknown, unknown>>(
  fn: (transaction: Transaction) => Promise<T>,
  transaction?: Transaction
): Promise<T> {
  const parent = transaction ?? getCurrentTransaction();
  if (!parent && config.getDustAPIConfig().nodeEnv === "test") {
    throw new Error(
      "No transaction provided and no transaction in CLS while running tests."
    );
  }
  // Share the physical root's savepoint counter, as in withTransaction above.
  let root = parent;
  while (root?.parent) {
    root = root.parent;
  }
  const current = await frontSequelize.transaction({ transaction: root });
  if (parent) {
    savepointParents.set(current, parent);
  }
  let shouldRollback = true;
  try {
    const result = await fn(current);
    if (result.isOk()) {
      // Sequelize owns cleanup once commit starts, including commit or afterCommit errors.
      shouldRollback = false;
      await current.commit();
    }
    return result;
  } finally {
    if (shouldRollback) {
      await current.rollback();
    }
  }
}

/**
 * @cc [owner:aubin-tchoi,label:backend;concurrency] external-effects-after-outer-commit
 * An explicit transaction defers the effect until it and all parent transactions commit;
 * rolling back any of them must suppress the effect. Without a transaction, run it immediately.
 */
export async function runAfterTransactionCommit(
  transaction: Transaction | undefined,
  effect: () => Promise<void>
): Promise<void> {
  if (!transaction) {
    await effect();
    return;
  }
  transaction.afterCommit(async () => {
    const parent = savepointParents.get(transaction) ?? transaction.parent;
    await runAfterTransactionCommit(parent, effect);
  });
}
