import { trustedFetch } from "@app/lib/egress";

export interface Base64EncodedImageContent {
  mediaType: string;
  data: string;
}

const GOOGLE_AI_STUDIO_SUPPORTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];

export async function fetchImageBase64(
  image_url: string
): Promise<Base64EncodedImageContent> {
  try {
    // Images in conversations come from Google storage
    const response = await trustedFetch(image_url);
    if (!response.ok) {
      throw new Error(`Invalid image: ${response.statusText}`);
    }

    const mediaType = response.headers.get("content-type");
    if (!mediaType) {
      throw new Error("Invalid image: missing content-type header");
    }
    if (!GOOGLE_AI_STUDIO_SUPPORTED_MIME_TYPES.includes(mediaType)) {
      throw new Error(`Unsupported image type: ${mediaType} for ${image_url}`);
    }

    const buffer = await response.arrayBuffer();
    const data = Buffer.from(buffer).toString("base64");

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
