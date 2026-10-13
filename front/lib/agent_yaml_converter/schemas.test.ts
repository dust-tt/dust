import { agentYAMLDataSourceConfigurationSchema } from "@app/lib/agent_yaml_converter/schemas";
import { describe, expect, it } from "vitest";

describe("agentYAMLDataSourceConfigurationSchema", () => {
  const base = { view_id: "dsv_abc", tags_filter: null };

  it("rejects an empty selection when is_select_all is false", () => {
    const result = agentYAMLDataSourceConfigurationSchema.safeParse({
      ...base,
      is_select_all: false,
      selected_resources: [],
    });

    expect(result.success).toBe(false);
  });

  it("accepts a non-empty selection when is_select_all is false", () => {
    const result = agentYAMLDataSourceConfigurationSchema.safeParse({
      ...base,
      is_select_all: false,
      selected_resources: ["folder-1"],
    });

    expect(result.success).toBe(true);
  });

  it("accepts an empty selection when is_select_all is true", () => {
    const result = agentYAMLDataSourceConfigurationSchema.safeParse({
      ...base,
      is_select_all: true,
      selected_resources: [],
    });

    expect(result.success).toBe(true);
  });
});
