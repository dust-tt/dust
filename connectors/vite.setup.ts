import { AsyncLocalStorage } from "node:async_hooks";
import { connectorsSequelize } from "@connectors/resources/storage";
import { Sequelize } from "sequelize";
import { afterEach, beforeEach, vi } from "vitest";

type CLSStore = Map<string, unknown>;
const clsStorage = new AsyncLocalStorage<CLSStore>();

function createNamespace() {
  return {
    get: (key: string): any => clsStorage.getStore()?.get(key),
    set: (key: string, value: unknown) =>
      clsStorage.getStore()?.set(key, value),
    // Bind fn to run in the current store context. Required by Sequelize's useCLS() validation.
    bind: (fn: (...args: any[]) => any) => {
      const store = clsStorage.getStore();
      return (...args: any[]) =>
        store ? clsStorage.run(store, () => fn(...args)) : fn(...args);
    },
    // Run fn in a child context. Required by Sequelize's useCLS() check.
    run: (fn: (ctx?: CLSStore) => void) => {
      const child = new Map<string, unknown>(clsStorage.getStore());
      clsStorage.run(child, () => fn(child));
    },
    createContext: (): CLSStore => new Map<string, unknown>(),
    enter: (context: CLSStore) => clsStorage.enterWith(context),
    // No-op: AsyncLocalStorage scopes context automatically.
    exit: (_context: CLSStore) => {},
  };
}

beforeEach(async (c) => {
  vi.clearAllMocks();
  const namespace = createNamespace();

  // We use CLS to create a namespace and a transaction to isolate each test.
  // See https://github.com/sequelize/sequelize/issues/11408#issuecomment-563962996
  // And https://sequelize.org/docs/v6/other-topics/transactions/#automatically-pass-transactions-to-all-queries
  Sequelize.useCLS(namespace);
  const context = namespace.createContext();
  namespace.enter(context);
  const transaction = await connectorsSequelize.transaction({
    autocommit: false,
  });
  namespace.set("transaction", transaction);

  // @ts-expect-error - storing context in the test context
  c["namespace"] = namespace;
  // @ts-expect-error - storing context in the test context
  c["context"] = context;
  // @ts-expect-error - storing context in the test context
  c["transaction"] = transaction;
});

afterEach(async (c2) => {
  // @ts-expect-error - storing context in the test context
  c2["transaction"].rollback();
  // @ts-expect-error - storing context in the test context
  c2["namespace"].exit(c2["context"]);
});
