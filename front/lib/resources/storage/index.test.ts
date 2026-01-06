/* eslint-disable dust/no-raw-sql */
import { QueryTypes } from "sequelize";
import { describe, expect, it } from "vitest";

import { frontSequelize } from "@app/lib/resources/storage";

describe("PostgreSQL BIGINT type parser", () => {
  it("parses single BIGINT values as numbers", async () => {
    const result = await frontSequelize.query<{ val: number }>(
      `SELECT 9007199254740991::BIGINT as val`,
      { type: QueryTypes.SELECT }
    );

    expect(result[0].val).toBe(9007199254740991);
    expect(typeof result[0].val).toBe("number");
  });

  it("parses BIGINT arrays as number arrays", async () => {
    const result = await frontSequelize.query<{ vals: number[] }>(
      `SELECT ARRAY[1, 2, 3]::BIGINT[] as vals`,
      { type: QueryTypes.SELECT }
    );

    expect(result[0].vals).toEqual([1, 2, 3]);
    expect(result[0].vals.every((v) => typeof v === "number")).toBe(true);
  });

  it("throws for unsafe BIGINT values", async () => {
    await expect(
      frontSequelize.query(`SELECT 9007199254740992::BIGINT as val`, {
        type: QueryTypes.SELECT,
      })
    ).rejects.toThrow("not a safe integer");
  });

  it("throws for unsafe values in BIGINT arrays", async () => {
    await expect(
      frontSequelize.query(
        `SELECT ARRAY[1, 9007199254740992]::BIGINT[] as vals`,
        { type: QueryTypes.SELECT }
      )
    ).rejects.toThrow("not a safe integer");
  });
});
