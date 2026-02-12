import { beforeEach, describe, expect, it, vi } from "vitest";

import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { getSuggestedTemplatesForQuery } from "@app/lib/api/assistant/template_suggestion";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TemplateFactory } from "@app/tests/utils/TemplateFactory";

// Mock call_llm to control runMultiActionsAgent responses.
vi.mock("@app/lib/api/assistant/call_llm", () => ({
  runMultiActionsAgent: vi.fn(),
}));

const mockRunMultiActionsAgent = vi.mocked(runMultiActionsAgent);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getSuggestedTemplatesForQuery", () => {
  it("returns matching templates from LLM response", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const template1 = await TemplateFactory.published();
    const template2 = await TemplateFactory.published();
    const template3 = await TemplateFactory.published();

    mockRunMultiActionsAgent.mockResolvedValueOnce({
      isOk: () => true,
      isErr: () => false,
      value: {
        actions: [
          {
            name: "suggest_templates",
            arguments: {
              suggested_templates: [
                { id: template1.sId, relevance: 0.9 },
                { id: template3.sId, relevance: 0.7 },
              ],
            },
          },
        ],
        generation: "",
      },
    } as never);

    const result = await getSuggestedTemplatesForQuery(authenticator, {
      query: "help me draft sales emails",
      templates: [template1, template2, template3],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0].sId).toBe(template1.sId);
      expect(result.value[1].sId).toBe(template3.sId);
    }
  });

  it("filters out unknown template IDs from LLM response", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const template1 = await TemplateFactory.published();

    mockRunMultiActionsAgent.mockResolvedValueOnce({
      isOk: () => true,
      isErr: () => false,
      value: {
        actions: [
          {
            name: "suggest_templates",
            arguments: {
              suggested_templates: [
                { id: template1.sId, relevance: 0.8 },
                { id: "non-existent-id", relevance: 0.6 },
              ],
            },
          },
        ],
        generation: "",
      },
    } as never);

    const result = await getSuggestedTemplatesForQuery(authenticator, {
      query: "data analysis agent",
      templates: [template1],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].sId).toBe(template1.sId);
    }
  });

  it("returns error when LLM call fails", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const template1 = await TemplateFactory.published();

    mockRunMultiActionsAgent.mockResolvedValueOnce({
      isOk: () => false,
      isErr: () => true,
      error: new Error("LLM call failed"),
    } as never);

    const result = await getSuggestedTemplatesForQuery(authenticator, {
      query: "something",
      templates: [template1],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Error suggesting templates");
    }
  });

  it("returns error when LLM response has no suggested_templates", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const template1 = await TemplateFactory.published();

    mockRunMultiActionsAgent.mockResolvedValueOnce({
      isOk: () => true,
      isErr: () => false,
      value: {
        actions: [
          {
            name: "suggest_templates",
            arguments: {},
          },
        ],
        generation: "",
      },
    } as never);

    const result = await getSuggestedTemplatesForQuery(authenticator, {
      query: "something",
      templates: [template1],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("No suggested_templates found");
    }
  });

  it("filters out templates below relevance threshold", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const template1 = await TemplateFactory.published();
    const template2 = await TemplateFactory.published();

    mockRunMultiActionsAgent.mockResolvedValueOnce({
      isOk: () => true,
      isErr: () => false,
      value: {
        actions: [
          {
            name: "suggest_templates",
            arguments: {
              suggested_templates: [
                { id: template1.sId, relevance: 0.8 },
                { id: template2.sId, relevance: 0.3 },
              ],
            },
          },
        ],
        generation: "",
      },
    } as never);

    const result = await getSuggestedTemplatesForQuery(authenticator, {
      query: "sales emails",
      templates: [template1, template2],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].sId).toBe(template1.sId);
    }
  });

  it("passes query and formatted templates to LLM", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const template1 = await TemplateFactory.published();
    await template1.updateAttributes({ tags: ["SALES"] });

    mockRunMultiActionsAgent.mockResolvedValueOnce({
      isOk: () => true,
      isErr: () => false,
      value: {
        actions: [
          {
            name: "suggest_templates",
            arguments: {
              suggested_templates: [{ id: template1.sId, relevance: 0.85 }],
            },
          },
        ],
        generation: "",
      },
    } as never);

    await getSuggestedTemplatesForQuery(authenticator, {
      query: "  sales emails  ",
      templates: [template1],
    });

    expect(mockRunMultiActionsAgent).toHaveBeenCalledOnce();
    const [, , input] = mockRunMultiActionsAgent.mock.calls[0];

    // Query should be trimmed.
    expect(input.conversation.messages[0].content).toEqual([
      { type: "text", text: "sales emails" },
    ]);

    // Prompt should contain formatted templates.
    expect(input.prompt).toContain(template1.sId);
    expect(input.prompt).toContain(template1.handle);
  });
});
