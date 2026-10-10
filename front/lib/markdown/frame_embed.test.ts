import {
  findFrameEmbedDirective,
  parseFrameEmbedDirective,
  serializeFrameEmbedDirective,
} from "@app/lib/markdown/frame_embed";
import { describe, expect, it } from "vitest";

describe("frame embed directive", () => {
  it("reads back the path it writes", () => {
    for (const path of [
      "pod-abc/dashboards/revenue.tsx",
      'conversation-c1/a "b" & c.tsx',
    ]) {
      expect(
        parseFrameEmbedDirective(`${serializeFrameEmbedDirective(path)}\n`)
          ?.path
      ).toBe(path);
    }
  });

  it.each([
    '::frame{path="pod-abc/x.tsx" title="X"}',
    "::frame{path=pod-abc/x.tsx}",
    '::frame{path=""}',
    '::frame{path="pod-abc/x.tsx"} trailing',
    ':frame{path="pod-abc/x.tsx"}',
  ])("does not read %j", (src) => {
    expect(parseFrameEmbedDirective(src)).toBeNull();
  });

  it("finds a directive only at the start of a line", () => {
    expect(findFrameEmbedDirective('Intro\n::frame{path="a"}')).toBe(6);
    expect(findFrameEmbedDirective('Intro ::frame{path="a"}')).toBe(-1);
  });
});
