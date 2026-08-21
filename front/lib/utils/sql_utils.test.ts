import {
  isWriteConflictError,
  retryOnWriteConflict,
} from "@app/lib/utils/sql_utils";
import { DatabaseError, UniqueConstraintError } from "sequelize";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/logger/logger", () => ({
  default: {
    warn: vi.fn(),
  },
}));

function databaseError(code?: string): DatabaseError {
  return new DatabaseError(
    Object.assign(new Error("boom"), { sql: "SELECT 1", ...(code && { code }) })
  );
}

describe("isWriteConflictError", () => {
  it("recognizes a unique violation", () => {
    expect(isWriteConflictError(new UniqueConstraintError({}))).toBe(true);
  });

  it("recognizes a deadlock", () => {
    expect(isWriteConflictError(databaseError("40P01"))).toBe(true);
  });

  it("ignores other database errors", () => {
    // 23503 is a foreign key violation: retrying cannot make the missing row appear.
    expect(isWriteConflictError(databaseError("23503"))).toBe(false);
  });

  it("ignores a database error without a driver code", () => {
    expect(isWriteConflictError(databaseError())).toBe(false);
  });

  it("ignores non-database errors", () => {
    expect(isWriteConflictError(new Error("boom"))).toBe(false);
    expect(isWriteConflictError("boom")).toBe(false);
    expect(isWriteConflictError(null)).toBe(false);
  });
});

describe("retryOnWriteConflict", () => {
  it("returns the first successful result without retrying", async () => {
    const run = vi.fn().mockResolvedValue("ok");

    await expect(retryOnWriteConflict(run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("re-runs after a write conflict", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new UniqueConstraintError({}))
      .mockResolvedValue("ok");

    await expect(retryOnWriteConflict(run)).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("gives up after the attempt budget and rethrows the last conflict", async () => {
    const lastError = new UniqueConstraintError({});
    const run = vi
      .fn()
      .mockRejectedValueOnce(new UniqueConstraintError({}))
      .mockRejectedValueOnce(new UniqueConstraintError({}))
      .mockRejectedValueOnce(lastError);

    await expect(retryOnWriteConflict(run)).rejects.toBe(lastError);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("rethrows anything that is not a write conflict", async () => {
    const error = new Error("boom");
    const run = vi.fn().mockRejectedValue(error);

    await expect(retryOnWriteConflict(run)).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
