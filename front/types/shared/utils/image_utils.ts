import { trustedFetch } from "@app/lib/egress/server";

export interface Base64EncodedImageContent {
  mediaType: string;
  data: string;
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

    const mediaType = response.headers.get("content-type");
    if (!mediaType) {
      throw new Error("Invalid image: missing content-type header");
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
