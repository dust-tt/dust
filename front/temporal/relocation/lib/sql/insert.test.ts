import { generateParameterizedInsertStatements } from "@app/temporal/relocation/lib/sql/insert";
import { describe, expect, it } from "vitest";

describe("generateParameterizedInsertStatements", () => {
  it("keeps column order alongside flattened parameters", () => {
    const [statement] = generateParameterizedInsertStatements("subscriptions", [
      { id: 1, workspaceId: 10, planId: 20 },
      { id: 2, workspaceId: 10, planId: 21 },
    ]);

    expect(statement?.columns).toEqual(["id", "workspaceId", "planId"]);
    expect(statement?.params).toEqual([1, 10, 20, 2, 10, 21]);
  });

  it.each([
    ["project_metadata", "frameTabs"],
    ["takeaways", "actionItems"],
    ["takeaway_versions", "actionItems"],
    ["workspace_sensitivity_label_configs", "allowedLabels"],
  ])("stringifies empty JSONB arrays for %s.%s", (tableName, column) => {
    const [statement] = generateParameterizedInsertStatements(tableName, [
      { [column]: [] },
    ]);

    expect(statement?.params).toEqual(["[]"]);
  });
});
