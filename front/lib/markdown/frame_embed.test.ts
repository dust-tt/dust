import {
  findFrameEmbedDirective,
  isFrameEmbedPath,
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
    '::embed_frame{path="pod-abc/x.tsx" title="X"}',
    "::embed_frame{path=pod-abc/x.tsx}",
    '::embed_frame{path=""}',
    '::embed_frame{path="pod-abc/x.tsx"} trailing',
    ':embed_frame{path="pod-abc/x.tsx"}',
    '::embed_frame{path="pod-abc/<draft>.tsx"}',
    '::embed_frame{path="pod-abc/a & b.tsx"}',
    '::embed_frame{path="pod-abc/it\'s.tsx"}',
  ])("does not read %j", (src) => {
    expect(parseFrameEmbedDirective(src)).toBeNull();
  });

  it("finds a directive only at the start of a line", () => {
    expect(findFrameEmbedDirective('Intro\n::embed_frame{path="a"}')).toBe(6);
    expect(findFrameEmbedDirective('Intro ::embed_frame{path="a"}')).toBe(-1);
    expect(findFrameEmbedDirective('::embed_frame{path="a"}')).toBe(-1);
  });

  it.each(["", "pod-abc/a\nb.tsx", "pod-abc/a\rb.tsx"])(
    "refuses the path %j",
    (path) => {
      expect(isFrameEmbedPath(path)).toBe(false);
    }
  );
});
