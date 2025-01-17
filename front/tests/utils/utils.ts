import type { Transaction } from "sequelize";
import { afterAll, beforeAll, expect } from "vitest";

import { frontSequelize } from "@app/lib/resources/storage";

export const expectArrayOfObjectsWithSpecificLength = (
  value: any,
  length: number
) => {
  expect(Array.isArray(value)).toBe(true);
  expect(value).toHaveLength(length);
  expect(
    value.every((item: unknown) => typeof item === "object" && item !== null)
  ).toBe(true);
};

/**
 * Helper to run test suites within a database transaction that gets rolled back.
 * This ensures each test starts with a clean database state.
 *
 * @param testSuite Function containing the test suite to run within transaction
 * @returns Async function that sets up transaction before tests and rolls back after
 */
export const withinTransaction = (testSuite: () => Promise<void> | void) => {
  return async () => {
    let transaction: Transaction;

    beforeAll(async () => {
      try {
        transaction = await frontSequelize.transaction();
      } catch (error) {
        console.error("Failed to start transaction:", error);
        throw error;
      }
    });

    afterAll(async () => {
      try {
        await transaction.rollback();
      } catch (error) {
        console.error("Failed to rollback transaction:", error);
        throw error;
      }
    });

    await testSuite();
  };
};
