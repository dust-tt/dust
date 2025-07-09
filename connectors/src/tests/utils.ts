import type { Transaction } from "sequelize";
import { expect, it } from "vitest";

import { sequelizeConnection } from "@connectors/resources/storage";

export const itInTransaction = function (
  title: string,
  fn: (t: Transaction) => Promise<void>,
  skip: boolean = false
) {
  return it.skipIf(skip)(title, async function () {
    try {
      await sequelizeConnection.transaction(async (t) => {
        await fn(t);
        throw "Rollback"; // Force rollback after successful execution
      });
    } catch (err) {
      if (err === "Rollback") {
        return;
      }
      console.log("Error in test:");
      console.log(err);
      throw err;
    }
  });
};

export const expectArrayOfObjectsWithSpecificLength = (
  value: unknown,
  length: number
) => {
  expect(Array.isArray(value)).toBe(true);
  expect(value).toHaveLength(length);
  expect(
    (value as Array<unknown>).every(
      (item: unknown) => typeof item === "object" && item !== null
    )
  ).toBe(true);
};
