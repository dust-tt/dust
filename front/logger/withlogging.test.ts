import { describe, expect, it } from "vitest";

import { getSequelizeErrorDetails } from "./withlogging";

// Mimics Sequelize's ValidationError structure without importing Sequelize.
function makeSequelizeValidationError(
  fieldErrors: { message: string; type: string; path: string }[]
): Error {
  const err = new Error("Validation error");
  err.name = "SequelizeValidationError";
  (err as any).errors = fieldErrors;
  return err;
}

function makeSequelizeUniqueConstraintError(
  fieldErrors: { message: string; type: string; path: string }[]
): Error {
  const err = new Error("Validation error");
  err.name = "SequelizeUniqueConstraintError";
  (err as any).errors = fieldErrors;
  return err;
}

describe("getSequelizeErrorDetails", () => {
  it("extracts field details from a SequelizeValidationError", () => {
    const err = makeSequelizeValidationError([
      {
        message: "content cannot be null",
        type: "notNull Violation",
        path: "content",
      },
    ]);

    const details = getSequelizeErrorDetails(err);

    expect(details).toEqual([
      {
        message: "content cannot be null",
        type: "notNull Violation",
        path: "content",
      },
    ]);
  });

  it("extracts field details from a SequelizeUniqueConstraintError", () => {
    const err = makeSequelizeUniqueConstraintError([
      {
        message: "sId must be unique",
        type: "unique violation",
        path: "sId",
      },
    ]);

    const details = getSequelizeErrorDetails(err);

    expect(details).toEqual([
      { message: "sId must be unique", type: "unique violation", path: "sId" },
    ]);
  });

  it("handles multiple field errors", () => {
    const err = makeSequelizeValidationError([
      { message: "field1 is required", type: "notNull Violation", path: "a" },
      { message: "field2 is too long", type: "len", path: "b" },
    ]);

    const details = getSequelizeErrorDetails(err);

    expect(details).toHaveLength(2);
    expect(details![0].path).toBe("a");
    expect(details![1].path).toBe("b");
  });

  it("returns undefined for a regular Error", () => {
    const err = new Error("something went wrong");

    expect(getSequelizeErrorDetails(err)).toBeUndefined();
  });

  it("returns undefined for a non-Sequelize error with an errors property", () => {
    const err = new Error("other library error");
    (err as any).errors = [{ message: "foo" }];

    expect(getSequelizeErrorDetails(err)).toBeUndefined();
  });
});
