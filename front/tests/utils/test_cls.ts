import { AsyncLocalStorage } from "node:async_hooks";

// Replacement for the deprecated cls-hooked package.
// Uses Node.js's built-in AsyncLocalStorage to provide the same continuation-local
// storage semantics used by Sequelize's useCLS() for automatic transaction propagation
// in tests. See https://sequelize.org/docs/v6/other-topics/transactions/#automatically-pass-transactions-to-all-queries

type CLSStore = Map<string, unknown>;

interface CLSNamespace {
  get(key: string): any;
  set(key: string, value: unknown): void;
  bind(fn: (...args: any[]) => any): (...args: any[]) => any;
  run(fn: (context?: CLSStore) => void): void;
  createContext(): CLSStore;
  enter(context: CLSStore): void;
  exit(context: CLSStore): void;
}

const namespaceRegistry = new Map<
  string,
  { storage: AsyncLocalStorage<CLSStore>; ns: CLSNamespace }
>();

export function createNamespace(name: string): CLSNamespace {
  const storage = new AsyncLocalStorage<CLSStore>();

  const ns: CLSNamespace = {
    get(key: string): any {
      return storage.getStore()?.get(key);
    },
    set(key: string, value: unknown): void {
      storage.getStore()?.set(key, value);
    },
    // Bind fn to run in the current store context. Required by Sequelize's useCLS() validation.
    bind(fn: (...args: any[]) => any): (...args: any[]) => any {
      const currentStore = storage.getStore();
      return (...args: any[]) => {
        if (currentStore) {
          return storage.run(currentStore, () => fn(...args));
        }
        return fn(...args);
      };
    },
    // Run fn in a child context inheriting the current store. Required by Sequelize's useCLS() validation.
    run(fn: (context?: CLSStore) => void): void {
      const current = storage.getStore();
      const childStore = new Map<string, unknown>(current);
      storage.run(childStore, () => fn(childStore));
    },
    createContext(): CLSStore {
      return new Map<string, unknown>();
    },
    enter(context: CLSStore): void {
      // enterWith() sets the store for the current async execution and all
      // continuations spawned from it, including the test body and afterEach.
      storage.enterWith(context);
    },
    exit(_context: CLSStore): void {
      // No-op: AsyncLocalStorage scopes context automatically through the
      // async execution chain — no explicit cleanup is needed.
    },
  };

  namespaceRegistry.set(name, { storage, ns });
  return ns;
}

export function getNamespace(name: string): CLSNamespace | undefined {
  return namespaceRegistry.get(name)?.ns;
}
