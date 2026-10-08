import { getAgentBuilderFormSchema } from "@app/components/agent_builder/agentBuilderFormSchema";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { AGENT_NAME_MAX_LENGTH } from "@app/types/assistant/agent";
import { describe, expect, it } from "vitest";

function getNameErrors(name: string) {
  const nameSchema = getAgentBuilderFormSchema((descriptor) =>
    i18n._(descriptor)
  ).shape.agentSettings.shape.name;
  const result = nameSchema.safeParse(name);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("agent name validation", () => {
  it("accepts a valid name", () => {
    expect(getNameErrors("MyAgent")).toEqual([]);
  });

  it.each([
    ["", "Agent name cannot be empty."],
    [
      "A".repeat(AGENT_NAME_MAX_LENGTH + 1),
      `Agent name must be at most ${AGENT_NAME_MAX_LENGTH} characters.`,
    ],
    ["My Agent", "Agent name cannot contain spaces."],
  ])("rejects %j with a message", (name, message) => {
    expect(getNameErrors(name)).toEqual([message]);
  });

  it("translates the message in French", async () => {
    i18n.loadAndActivate({
      locale: "fr-FR",
      messages: await loadCatalog("fr-FR"),
    });

    expect(getNameErrors("My Agent")).toEqual([
      "Le nom de l’agent ne peut pas contenir d’espaces.",
    ]);
  });
});
