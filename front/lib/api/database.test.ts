import { frontSequelize } from "@app/lib/resources/storage";
import { runWithTemporalActivityContext } from "@app/lib/temporal_activity_context";
import { QueryTypes } from "sequelize";
import { describe, expect, it } from "vitest";

describe("SequelizeWithComments", () => {
  it("injects the Temporal activity name into SQL comments", async () => {
    const [result] = await runWithTemporalActivityContext(
      "testActivity",
      () => {
        // biome-ignore lint/plugin/noRawSql: current_query() verifies the comment received by PostgreSQL
        return frontSequelize.query<{ query: string }>(
          'SELECT current_query() AS "query"',
          { type: QueryTypes.SELECT }
        );
      }
    );

    expect(result.query).toBe(
      "SELECT current_query() AS \"query\" /*activity='testActivity'*/"
    );
  });
});
