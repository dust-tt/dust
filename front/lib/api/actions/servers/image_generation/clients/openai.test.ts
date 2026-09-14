import { toImageSize } from "@app/lib/api/actions/servers/image_generation/clients/openai";
import type { ImageGenerationToolInput } from "@app/lib/api/actions/servers/image_generation/metadata";
import { CONVERSATION_IMG_MAX_SIZE_PIXELS } from "@app/lib/api/files/processing/images";
import { describe, expect, it } from "vitest";

const ASPECT_RATIOS = [
  "1:1",
  "3:2",
  "2:3",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const satisfies readonly ImageGenerationToolInput["aspectRatio"][];

const QUALITIES = [
  "low",
  "medium",
] as const satisfies readonly ImageGenerationToolInput["quality"][];

// Limits gpt-image models enforce on arbitrary WIDTHxHEIGHT sizes.
const MULTIPLE = 16;
const MIN_PIXELS = 655_360;
const MAX_PIXELS = 8_294_400;

describe("toImageSize", () => {
  for (const aspectRatio of ASPECT_RATIOS) {
    for (const quality of QUALITIES) {
      it(`returns an accepted size for ${aspectRatio} at ${quality} quality`, () => {
        const [width, height] = toImageSize({ aspectRatio, quality })
          .split("x")
          .map(Number);

        const [ratioWidth, ratioHeight] = aspectRatio.split(":").map(Number);
        expect(width * ratioHeight).toBe(height * ratioWidth);

        expect(width % MULTIPLE).toBe(0);
        expect(height % MULTIPLE).toBe(0);

        // Staying within the conversation cap is what keeps the upload off the imgproxy
        // resize path; imgproxy is not available in local development.
        expect(Math.max(width, height)).toBeLessThanOrEqual(
          CONVERSATION_IMG_MAX_SIZE_PIXELS
        );

        expect(width * height).toBeGreaterThanOrEqual(MIN_PIXELS);
        expect(width * height).toBeLessThanOrEqual(MAX_PIXELS);
      });
    }
  }

  it("scales up with quality", () => {
    const pixels = QUALITIES.map((quality) => {
      const [width, height] = toImageSize({ aspectRatio: "16:9", quality })
        .split("x")
        .map(Number);
      return width * height;
    });

    expect(pixels[0]).toBeLessThan(pixels[1]);
  });
});
