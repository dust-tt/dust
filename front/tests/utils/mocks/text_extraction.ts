import { Readable } from "stream";
import { vi } from "vitest";

/**
 * Mock for @app/types/shared/text_extraction. Globally registered in vite.setup.ts.
 * Returns a dummy plain-text stream from `fromStream`.
 */
export function mockTextExtraction() {
  class MockTextExtraction {
    fromStream = vi
      .fn()
      .mockResolvedValue(Readable.from("mock extracted text"));
  }

  return {
    isTextExtractionSupportedContentType: vi.fn().mockReturnValue(true),
    TextExtraction: MockTextExtraction,
  };
}
