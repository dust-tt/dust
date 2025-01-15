import type { Sequelize, Transaction } from "sequelize";
import { afterAll, beforeAll } from "vitest";

// Wrapper to make sure that each test suite has a clean database
export function withTestDatabase(
  db: Sequelize,
  testSuite: { (): Promise<void>; (): void }
) {
  return async () => {
    let transaction: Transaction;

    beforeAll(async () => {
      try {
        transaction = await db.transaction();
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
}
