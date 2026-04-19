import { describe, expect, it } from "vitest";
import { serializeBrandPlaybook } from "../../lib/brandbook_serializer";
import type { BrandPlaybookType } from "../../types/brandbook";

const SAMPLE: BrandPlaybookType = {
  version: 1,
  brand: {
    name: "Acme",
    tagline: "Build better",
    mission: "Empower teams",
    positioning: "The fastest way",
  },
  identity: {
    colors: {
      primary: "#1C91FF",
      secondary: "#418B5C",
      background: "#FFFFFF",
      text: "#111418",
    },
    typography: {
      heading: { family: "Georgia", weight: "600" },
      body: { family: "Inter", weight: "400" },
      accent: { family: "monospace", weight: "400" },
    },
    logoUrl: null,
  },
  voice: {
    tone: "Warm and direct",
    keyMessages: "Speed matters",
    doList: "Be concise\nUse active voice",
    dontList: "Avoid jargon",
  },
};

describe("serializeBrandPlaybook", () => {
  it("returns an array of documents, one per non-empty section", () => {
    const docs = serializeBrandPlaybook(SAMPLE);
    // Always: _playbook + brand + identity + voice = 4
    expect(docs.length).toBeGreaterThanOrEqual(4);
  });

  it("always includes a _playbook document with full JSON", () => {
    const docs = serializeBrandPlaybook(SAMPLE);
    const playbook = docs.find((d) => d.documentId === "_playbook");
    expect(playbook).toBeDefined();
    const jsonContent = playbook!.text
      .replace(/^```json\n/, "")
      .replace(/\n```$/, "");
    const parsed = JSON.parse(jsonContent);
    expect(parsed.brand.name).toBe("Acme");
    expect(parsed.identity.colors.primary).toBe("#1C91FF");
  });

  it("includes a brand identity document", () => {
    const docs = serializeBrandPlaybook(SAMPLE);
    const brand = docs.find((d) => d.documentId === "brand");
    expect(brand).toBeDefined();
    expect(brand!.text).toContain("Acme");
    expect(brand!.tags).toContain("brandbook");
  });

  it("skips the voice document when all voice fields are empty", () => {
    const empty: BrandPlaybookType = {
      ...SAMPLE,
      voice: { tone: "", keyMessages: "", doList: "", dontList: "" },
    };
    const docs = serializeBrandPlaybook(empty);
    const voice = docs.find((d) => d.documentId === "voice");
    expect(voice).toBeUndefined();
  });

  it("includes color tokens in the identity document", () => {
    const docs = serializeBrandPlaybook(SAMPLE);
    const identity = docs.find((d) => d.documentId === "identity");
    expect(identity).toBeDefined();
    expect(identity!.text).toContain("#1C91FF");
  });
});
