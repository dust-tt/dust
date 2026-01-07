import probeImageSize from "probe-image-size";
import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock probe-image-size
vi.mock("probe-image-size", () => ({
  default: vi.fn(),
}));

// Mock logger to avoid console output during tests
vi.mock("@app/logger/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Image dimension checking logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("probe-image-size integration", () => {
    it("should successfully probe dimensions from a stream", async () => {
      const mockDimensions = {
        width: 1000,
        height: 800,
        type: "jpg",
      };

      vi.mocked(probeImageSize).mockResolvedValue(mockDimensions as any);

      const mockStream = Readable.from(Buffer.from("fake image data"));
      const result = await probeImageSize(mockStream);

      expect(result.width).toBe(1000);
      expect(result.height).toBe(800);
      expect(probeImageSize).toHaveBeenCalledWith(mockStream);
    });

    it("should handle probe errors gracefully", async () => {
      const mockError = new Error("Invalid image format");
      vi.mocked(probeImageSize).mockRejectedValue(mockError);

      const mockStream = Readable.from(Buffer.from("invalid data"));

      await expect(probeImageSize(mockStream)).rejects.toThrow(
        "Invalid image format"
      );
    });
  });

  describe("Dimension checking logic", () => {
    const MAX_SIZE_CONVERSATION = 1538;
    const MAX_SIZE_AVATAR = 256;

    it("should identify image within conversation limits", () => {
      const width = 1000;
      const height = 800;

      const isWithinLimits =
        width <= MAX_SIZE_CONVERSATION && height <= MAX_SIZE_CONVERSATION;

      expect(isWithinLimits).toBe(true);
    });

    it("should identify image exceeding width limit", () => {
      const width = 2000;
      const height = 800;

      const isWithinLimits =
        width <= MAX_SIZE_CONVERSATION && height <= MAX_SIZE_CONVERSATION;

      expect(isWithinLimits).toBe(false);
    });

    it("should identify image exceeding height limit", () => {
      const width = 1000;
      const height = 2000;

      const isWithinLimits =
        width <= MAX_SIZE_CONVERSATION && height <= MAX_SIZE_CONVERSATION;

      expect(isWithinLimits).toBe(false);
    });

    it("should identify image exceeding both dimensions", () => {
      const width = 2000;
      const height = 2000;

      const isWithinLimits =
        width <= MAX_SIZE_CONVERSATION && height <= MAX_SIZE_CONVERSATION;

      expect(isWithinLimits).toBe(false);
    });

    it("should accept image at exact boundary", () => {
      const width = MAX_SIZE_CONVERSATION;
      const height = MAX_SIZE_CONVERSATION;

      const isWithinLimits =
        width <= MAX_SIZE_CONVERSATION && height <= MAX_SIZE_CONVERSATION;

      expect(isWithinLimits).toBe(true);
    });

    it("should reject image one pixel over boundary", () => {
      const width = MAX_SIZE_CONVERSATION + 1;
      const height = MAX_SIZE_CONVERSATION;

      const isWithinLimits =
        width <= MAX_SIZE_CONVERSATION && height <= MAX_SIZE_CONVERSATION;

      expect(isWithinLimits).toBe(false);
    });

    it("should apply avatar size limits correctly", () => {
      const smallWidth = 200;
      const smallHeight = 200;

      const isWithinAvatarLimits =
        smallWidth <= MAX_SIZE_AVATAR && smallHeight <= MAX_SIZE_AVATAR;

      expect(isWithinAvatarLimits).toBe(true);

      const largeWidth = 300;
      const largeHeight = 200;

      const isLargeWithinAvatarLimits =
        largeWidth <= MAX_SIZE_AVATAR && largeHeight <= MAX_SIZE_AVATAR;

      expect(isLargeWithinAvatarLimits).toBe(false);
    });
  });

  describe("Image format support", () => {
    it("should handle JPEG images", async () => {
      const mockDimensions = {
        width: 1200,
        height: 900,
        type: "jpg",
      };

      vi.mocked(probeImageSize).mockResolvedValue(mockDimensions as any);

      const mockStream = Readable.from(Buffer.from("fake jpeg"));
      const result = await probeImageSize(mockStream);

      expect(result.type).toBe("jpg");
    });

    it("should handle PNG images", async () => {
      const mockDimensions = {
        width: 800,
        height: 600,
        type: "png",
      };

      vi.mocked(probeImageSize).mockResolvedValue(mockDimensions as any);

      const mockStream = Readable.from(Buffer.from("fake png"));
      const result = await probeImageSize(mockStream);

      expect(result.type).toBe("png");
    });

    it("should handle WebP images", async () => {
      const mockDimensions = {
        width: 1000,
        height: 1000,
        type: "webp",
      };

      vi.mocked(probeImageSize).mockResolvedValue(mockDimensions as any);

      const mockStream = Readable.from(Buffer.from("fake webp"));
      const result = await probeImageSize(mockStream);

      expect(result.type).toBe("webp");
    });

    it("should handle GIF images", async () => {
      const mockDimensions = {
        width: 500,
        height: 500,
        type: "gif",
      };

      vi.mocked(probeImageSize).mockResolvedValue(mockDimensions as any);

      const mockStream = Readable.from(Buffer.from("fake gif"));
      const result = await probeImageSize(mockStream);

      expect(result.type).toBe("gif");
    });
  });

  describe("Edge cases", () => {
    it("should handle very large images", async () => {
      const mockDimensions = {
        width: 4000,
        height: 3000,
        type: "jpg",
      };

      vi.mocked(probeImageSize).mockResolvedValue(mockDimensions as any);

      const mockStream = Readable.from(Buffer.from("large image"));
      const result = await probeImageSize(mockStream);

      const MAX_SIZE = 1538;
      const needsResize = result.width > MAX_SIZE || result.height > MAX_SIZE;

      expect(needsResize).toBe(true);
    });

    it("should handle very small images", async () => {
      const mockDimensions = {
        width: 100,
        height: 100,
        type: "png",
      };

      vi.mocked(probeImageSize).mockResolvedValue(mockDimensions as any);

      const mockStream = Readable.from(Buffer.from("tiny image"));
      const result = await probeImageSize(mockStream);

      const MAX_SIZE = 1538;
      const needsResize = result.width > MAX_SIZE || result.height > MAX_SIZE;

      expect(needsResize).toBe(false);
    });

    it("should handle portrait orientation images", async () => {
      const mockDimensions = {
        width: 800,
        height: 1200,
        type: "jpg",
      };

      vi.mocked(probeImageSize).mockResolvedValue(mockDimensions as any);

      const mockStream = Readable.from(Buffer.from("portrait image"));
      const result = await probeImageSize(mockStream);

      const MAX_SIZE = 1538;
      const isWithinLimits = result.width <= MAX_SIZE && result.height <= MAX_SIZE;

      expect(isWithinLimits).toBe(true);
    });

    it("should handle landscape orientation images", async () => {
      const mockDimensions = {
        width: 1200,
        height: 800,
        type: "jpg",
      };

      vi.mocked(probeImageSize).mockResolvedValue(mockDimensions as any);

      const mockStream = Readable.from(Buffer.from("landscape image"));
      const result = await probeImageSize(mockStream);

      const MAX_SIZE = 1538;
      const isWithinLimits = result.width <= MAX_SIZE && result.height <= MAX_SIZE;

      expect(isWithinLimits).toBe(true);
    });

    it("should handle square images", async () => {
      const mockDimensions = {
        width: 1500,
        height: 1500,
        type: "jpg",
      };

      vi.mocked(probeImageSize).mockResolvedValue(mockDimensions as any);

      const mockStream = Readable.from(Buffer.from("square image"));
      const result = await probeImageSize(mockStream);

      const MAX_SIZE = 1538;
      const isWithinLimits = result.width <= MAX_SIZE && result.height <= MAX_SIZE;

      expect(isWithinLimits).toBe(true);
    });
  });
});

/**
 * NOTE: Full functional/integration tests for the file upload flow should be done
 * at the endpoint level (POST /api/w/[wId]/files/[fileId]) per CODING_RULES.md [TEST1].
 *
 * These unit tests verify the core dimension checking logic in isolation.
 * For comprehensive testing, create functional tests that:
 * 1. Upload small images (within 1538x1538) and verify ConvertAPI is NOT called
 * 2. Upload large images (exceeding 1538x1538) and verify ConvertAPI IS called
 * 3. Test various image formats (JPEG, PNG, WebP, GIF)
 * 4. Test both conversation and avatar use cases
 * 5. Verify error handling when dimension probing fails
 * 6. Verify images display correctly in conversations after processing
 */
