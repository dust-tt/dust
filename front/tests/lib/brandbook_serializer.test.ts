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
  it("returns exactly 4 documents when every section has content", () => {
    const docs = serializeBrandPlaybook(SAMPLE);
    // Always: _playbook + brand + identity + voice = 4
    expect(docs.length).toBe(4);
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

  it("skips the voice document when fields contain only whitespace", () => {
    const whitespaceOnly: BrandPlaybookType = {
      ...SAMPLE,
      voice: {
        tone: "   ",
        keyMessages: "\n\n",
        doList: "\t",
        dontList: "  \n  ",
      },
    };
    const docs = serializeBrandPlaybook(whitespaceOnly);
    const voice = docs.find((d) => d.documentId === "voice");
    expect(voice).toBeUndefined();
    expect(docs.length).toBe(3);
  });

  it("trims do/don't list entries (no empty bullets, no leading spaces)", () => {
    const messy: BrandPlaybookType = {
      ...SAMPLE,
      voice: {
        tone: "  Direct  ",
        keyMessages: "",
        doList: "  Be concise  \n\n  Use active voice  \n   ",
        dontList: "Avoid jargon\n   \nDon't be vague",
      },
    };
    const docs = serializeBrandPlaybook(messy);
    const voice = docs.find((d) => d.documentId === "voice");
    expect(voice).toBeDefined();
    // Tone is trimmed, no leading/trailing whitespace.
    expect(voice!.text).toContain("## Tone\nDirect");
    expect(voice!.text).not.toContain("  Direct  ");
    // Empty lines in lists are filtered out (no `- ` followed by nothing).
    expect(voice!.text).not.toMatch(/^- $/m);
    // Each non-empty entry becomes a bullet, trimmed.
    expect(voice!.text).toContain("- Be concise");
    expect(voice!.text).toContain("- Use active voice");
    expect(voice!.text).toContain("- Avoid jargon");
    expect(voice!.text).toContain("- Don't be vague");
  });

  it("uses sequential document order suitable for BACK7 upload", () => {
    const docs = serializeBrandPlaybook(SAMPLE);
    // Order must be: _playbook, brand, identity, voice.
    expect(docs.map((d) => d.documentId)).toEqual([
      "_playbook",
      "brand",
      "identity",
      "voice",
    ]);
  });

  it("falls back to 'Brand' when name is empty/whitespace", () => {
    const noName: BrandPlaybookType = {
      ...SAMPLE,
      brand: { ...SAMPLE.brand, name: "  " },
    };
    const docs = serializeBrandPlaybook(noName);
    const brand = docs.find((d) => d.documentId === "brand");
    expect(brand!.title).toContain("Brand —");
  });
});
