import {
  findFrameEmbedDirective,
  isFrameEmbedPath,
  parseFrameEmbedDirective,
  parseFrameEmbedHeight,
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

  it("reads back the height it writes", () => {
    for (const height of [1, 400, 99999]) {
      expect(
        parseFrameEmbedDirective(
          `${serializeFrameEmbedDirective("pod-abc/x.tsx", height)}\n`
        )
      ).toMatchObject({ path: "pod-abc/x.tsx", height });
    }
    expect(
      parseFrameEmbedDirective(serializeFrameEmbedDirective("pod-abc/x.tsx"))
    ).toMatchObject({ height: null });
  });

  it.each([
    '::embed_frame{path="pod-abc/x.tsx" title="X"}',
    '::embed_frame{path="pod-abc/x.tsx" height="0"}',
    '::embed_frame{path="pod-abc/x.tsx" height="040"}',
    '::embed_frame{path="pod-abc/x.tsx" height="400px"}',
    '::embed_frame{path="pod-abc/x.tsx" height="100000"}',
    '::embed_frame{path="pod-abc/x.tsx" height=400}',
    '::embed_frame{height="400" path="pod-abc/x.tsx"}',
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

  it.each([0, -1, 1.5, 100000, "abc", null])(
    "refuses the height %j",
    (height) => {
      expect(parseFrameEmbedHeight(height)).toBeNull();
    }
  );

  it.each(["", "pod-abc/a\nb.tsx", "pod-abc/a\rb.tsx"])(
    "refuses the path %j",
    (path) => {
      expect(isFrameEmbedPath(path)).toBe(false);
    }
  );
});
