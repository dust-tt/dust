import { default as cls } from "cls-hooked";
import { Sequelize } from "sequelize";
import { afterEach, beforeEach, vi } from "vitest";

import { sequelizeConnection } from "@connectors/resources/storage";

beforeEach(async (c) => {
  vi.clearAllMocks();
  const namespace = cls.createNamespace("test-namespace");

  // We use CLS to create a namespace and a transaction to isolate each test.
  // See https://github.com/sequelize/sequelize/issues/11408#issuecomment-563962996
  // And https://sequelize.org/docs/v6/other-topics/transactions/#automatically-pass-transactions-to-all-queries
  Sequelize.useCLS(namespace);
  const context = namespace.createContext();
  namespace.enter(context);
  const transaction = await sequelizeConnection.transaction({
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
