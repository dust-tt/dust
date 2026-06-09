import { trustedFetch } from "@app/lib/egress/server";

export interface Base64EncodedImageContent {
  mediaType: string;
  data: string;
}

function detectImageMediaType(buffer: Buffer): string | null {
  // JPEG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  // GIF: "GIF8" (47 49 46 38)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }
  // WebP: "RIFF" (52 49 46 46) .... "WEBP" (57 45 42 50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export async function trustedFetchImageBase64(
  image_url: string
): Promise<Base64EncodedImageContent> {
  try {
    // Images in conversations come from Google storage
    const response = await trustedFetch(image_url);
    if (!response.ok) {
      throw new Error(`Invalid image: ${response.statusText}`);
    }

    const headerMediaType = response.headers.get("content-type");

    const buffer = Buffer.from(await response.arrayBuffer());
    const data = buffer.toString("base64");

    // Prefer the media type detected from the actual bytes over the stored
    // content-type header, which may be stale or mislabeled.
    const mediaType = detectImageMediaType(buffer) ?? headerMediaType;
    if (!mediaType) {
      throw new Error("Invalid image: missing content-type header");
    }

    return {
      mediaType,
      data,
    };
  } catch (error) {
    throw new Error(
      `Invalid image: ${error instanceof Error ? error.message : error}`
    );
  }
}
