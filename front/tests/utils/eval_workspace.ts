import { frontSequelize } from "@app/lib/resources/storage";
import { createNamespace } from "@app/tests/utils/test_cls";
import { Sequelize } from "sequelize";

/**
 * Runs `fn` inside a committed CLS transaction.
 *
 * The eval suites seed their data once in `beforeAll`, which runs before the per-test CLS
 * transaction from `vite.setup.ts` exists, and the factories require one. This sets up an
 * equivalent CLS context around `fn` and commits it, so the data outlives the setup and is
 * visible to every (concurrent) test. `Sequelize.useCLS` is global: never run two of these
 * concurrently.
 */
export async function runInCommittedTransaction<T>(
  fn: () => Promise<T>
): Promise<T> {
  const namespace = createNamespace("eval-setup-namespace");
  // biome-ignore lint/correctness/useHookAtTopLevel: Sequelize's CLS setter, not a React hook
  Sequelize.useCLS(namespace);
  const context = namespace.createContext();
  namespace.enter(context);
  const transaction = await frontSequelize.transaction({ autocommit: false });
  namespace.set("transaction", transaction);

  try {
    const result = await fn();
    await transaction.commit();
    return result;
  } catch (e) {
    await transaction.rollback();
    throw e;
  } finally {
    namespace.exit(context);
  }
}
