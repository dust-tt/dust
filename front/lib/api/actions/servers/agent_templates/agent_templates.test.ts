import { getSuggestedTemplatesForQuery } from "@app/lib/api/assistant/template_suggestion";
import type { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TemplateFactory } from "@app/tests/utils/TemplateFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TOOLS } from "./index";

vi.mock("@app/lib/api/assistant/template_suggestion", () => ({
  getSuggestedTemplatesForQuery: vi.fn(),
}));

beforeEach(async () => {
  const templateSuggestion = await import(
    "@app/lib/api/assistant/template_suggestion"
  );
  vi.mocked(templateSuggestion.getSuggestedTemplatesForQuery).mockReset();
});

function getToolByName(name: string) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool;
}

function createTestExtra(auth: Authenticator, runContext?: unknown) {
  return {
    signal: new AbortController().signal,
    auth,
    runContext,
  } as Parameters<(typeof TOOLS)[0]["handler"]>[1];
}

describe("agent_templates tools", () => {
  describe("search_agent_templates", () => {
    it("returns at most 10 published templates when no jobType", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      for (let i = 0; i < 12; i++) {
        await TemplateFactory.published();
      }
      await TemplateFactory.draft();

      const tool = getToolByName("search_agent_templates");
      const result = await tool.handler({}, createTestExtra(authenticator));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          expect(content.text).toMatch(/Found 10 template\(s\):/);
          expect((content.text.match(/## Template/g) ?? []).length).toBe(10);
        }
      }
    });

    it("filters templates by jobType tags", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const salesTemplate = await TemplateFactory.published();
      await salesTemplate.updateAttributes({ tags: ["SALES"] });

      const engineeringTemplate = await TemplateFactory.published();
      await engineeringTemplate.updateAttributes({ tags: ["ENGINEERING"] });

      const tool = getToolByName("search_agent_templates");
      const result = await tool.handler(
        { jobType: "sales" },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          expect(content.text).toContain(`sId: ${salesTemplate.sId}`);
          expect(content.text).not.toContain(engineeringTemplate.sId);
        }
      }
    });

    it("returns at most 10 templates for unknown jobType", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      for (let i = 0; i < 12; i++) {
        await TemplateFactory.published();
      }

      const tool = getToolByName("search_agent_templates");
      const result = await tool.handler(
        { jobType: "unknown_type" },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          expect(content.text).toMatch(/Found 10 template\(s\):/);
        }
      }
    });

    it("returns expected fields per template", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const template = await TemplateFactory.published();
      await template.updateAttributes({
        tags: ["SALES"],
        sidekickInstructions: "Test sidekick instructions",
      });

      const tool = getToolByName("search_agent_templates");
      const result = await tool.handler(
        { jobType: "sales" },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          expect(content.text).toContain(`sId: ${template.sId}`);
          expect(content.text).toContain(`handle: ${template.handle}`);
          expect(content.text).toContain(
            (template.userFacingDescription ?? "").trim()
          );
          expect(content.text).toContain(
            (template.agentFacingDescription ?? "").trim()
          );
          expect(content.text).toContain("Test sidekick instructions");
          expect(content.text).toContain("tags: SALES");
        }
      }
    });

    it("uses LLM-based fuzzy matching when query is provided", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const template1 = await TemplateFactory.published();
      await TemplateFactory.published();

      vi.mocked(getSuggestedTemplatesForQuery).mockResolvedValueOnce(
        new Ok([template1])
      );

      const tool = getToolByName("search_agent_templates");
      const result = await tool.handler(
        { query: "help me draft sales emails" },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          expect(content.text).toMatch(/Found 1 template\(s\):/);
          expect(content.text).toContain(`sId: ${template1.sId}`);
        }
      }

      expect(getSuggestedTemplatesForQuery).toHaveBeenCalledOnce();
    });

    it("returns error when query-based search fails", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      await TemplateFactory.published();

      vi.mocked(getSuggestedTemplatesForQuery).mockResolvedValueOnce(
        new Err(new Error("LLM call failed"))
      );

      const tool = getToolByName("search_agent_templates");
      const result = await tool.handler(
        { query: "something" },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("LLM call failed");
      }
    });

    it("combines jobType tag filtering with query-based search", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const salesTemplate = await TemplateFactory.published();
      await salesTemplate.updateAttributes({ tags: ["SALES"] });

      const engineeringTemplate = await TemplateFactory.published();
      await engineeringTemplate.updateAttributes({ tags: ["ENGINEERING"] });

      vi.mocked(getSuggestedTemplatesForQuery).mockResolvedValueOnce(
        new Ok([salesTemplate])
      );

      const tool = getToolByName("search_agent_templates");
      const result = await tool.handler(
        { jobType: "sales", query: "sales email drafter" },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      expect(getSuggestedTemplatesForQuery).toHaveBeenCalledOnce();
      const callArgs = vi.mocked(getSuggestedTemplatesForQuery).mock.calls[0];
      const passedTemplates = callArgs[1].templates;
      const passedIds = passedTemplates.map((t) => t.sId);
      expect(passedIds).toContain(salesTemplate.sId);
      expect(passedIds).not.toContain(engineeringTemplate.sId);
    });
  });

  describe("get_agent_template", () => {
    it("returns template with sidekickInstructions", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const template = await TemplateFactory.published();
      await template.updateAttributes({
        sidekickInstructions: "Test sidekick instructions for this template",
      });

      const tool = getToolByName("get_agent_template");
      const result = await tool.handler(
        { templateId: template.sId },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          expect(content.text).toContain(`sId: ${template.sId}`);
          expect(content.text).toContain(`handle: ${template.handle}`);
          expect(content.text).toContain(
            "Test sidekick instructions for this template"
          );
        }
      }
    });

    it("returns null sidekickInstructions when not set", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const template = await TemplateFactory.published();
      await template.updateAttributes({ sidekickInstructions: null });

      const tool = getToolByName("get_agent_template");
      const result = await tool.handler(
        { templateId: template.sId },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          expect(content.text).toContain(`sId: ${template.sId}`);
          expect(content.text).not.toContain("sidekickInstructions:");
        }
      }
    });

    it("returns error for non-existent template", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const tool = getToolByName("get_agent_template");
      const result = await tool.handler(
        { templateId: "non-existent-template-id" },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("Template not found");
        expect(result.error.message).toContain("non-existent-template-id");
      }
    });
  });
});
