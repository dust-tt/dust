import { describe, expect, it } from "bun:test";
import { canAutoStopForwarderPortProcess, formatForwarderMapping } from "../../src/lib/forward";
import { FORWARDER_MAPPINGS } from "../../src/lib/forwarderConfig";
import { WORKSPACE_ID } from "../../src/lib/seed";

const BASE_PORT = 12000;
const ESC = "\x1b";

// Strip OSC 8 hyperlink escapes, keeping the visible text.
const HYPERLINK_ESCAPES = new RegExp(`${ESC}\\]8;;.*?${ESC}\\\\`, "g");

function stripHyperlinks(line: string): string {
  return line.replace(HYPERLINK_ESCAPES, "");
}

function mappingNamed(name: string) {
  const mapping = FORWARDER_MAPPINGS.find((m) => m.name === name);
  if (!mapping) throw new Error(`No mapping named ${name}`);
  return mapping;
}

describe("forwarder process ownership", () => {
  it("can stop another dust-hive forwarder", () => {
    expect(canAutoStopForwarderPortProcess(3000, "bun run src/forward-daemon.ts 10000")).toBe(true);
  });

  it("can stop a standalone Storybook on its forwarded port", () => {
    expect(
      canAutoStopForwarderPortProcess(6006, "node /repo/node_modules/.bin/storybook dev -p 6006")
    ).toBe(true);
  });

  it("does not stop Storybook processes on unrelated ports", () => {
    expect(canAutoStopForwarderPortProcess(3000, "storybook dev -p 3000")).toBe(false);
  });

  it("does not stop unknown processes on the Storybook port", () => {
    expect(canAutoStopForwarderPortProcess(6006, "node server.js")).toBe(false);
  });
});

describe("formatForwarderMapping", () => {
  it("prints listen and target URLs", () => {
    const line = stripHyperlinks(formatForwarderMapping(mappingNamed("proxy"), BASE_PORT));
    expect(line).toMatch(/^proxy\s+http:\/\/localhost:3000\s+→ http:\/\/localhost:12000$/);
  });

  it("deep-links SPA rows into the seeded workspace", () => {
    const app = stripHyperlinks(formatForwarderMapping(mappingNamed("front-spa-app"), BASE_PORT));
    expect(app).toContain(`http://localhost:3011/w/${WORKSPACE_ID}`);
    expect(app).toContain(`http://localhost:12011/w/${WORKSPACE_ID}`);

    const poke = stripHyperlinks(formatForwarderMapping(mappingNamed("front-spa-poke"), BASE_PORT));
    expect(poke).toContain(`http://localhost:3010/${WORKSPACE_ID}`);
    expect(poke).toContain(`http://localhost:12010/${WORKSPACE_ID}`);
  });

  it("aligns arrows across all rows", () => {
    const arrowColumns = FORWARDER_MAPPINGS.map((m) =>
      stripHyperlinks(formatForwarderMapping(m, BASE_PORT)).indexOf("→")
    );
    expect(new Set(arrowColumns).size).toBe(1);
  });

  it("wraps both URLs in OSC 8 hyperlinks", () => {
    const line = formatForwarderMapping(mappingNamed("proxy"), BASE_PORT);
    expect(line).toContain(
      `${ESC}]8;;http://localhost:3000${ESC}\\http://localhost:3000${ESC}]8;;${ESC}\\`
    );
    expect(line).toContain(
      `${ESC}]8;;http://localhost:12000${ESC}\\http://localhost:12000${ESC}]8;;${ESC}\\`
    );
  });
});
