import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SUPPORTED_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export function isSupportedImageContentType(contentType: string): boolean {
  return SUPPORTED_IMAGE_CONTENT_TYPES.includes(
    contentType as (typeof SUPPORTED_IMAGE_CONTENT_TYPES)[number]
  );
}
