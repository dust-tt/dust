import React from "react";
import { useEffect, useState } from "react";

export function Img({
  src,
  alt,
}: {
  src?: string | undefined;
  alt?: string | undefined;
}) {
  const [isSafe, setIsSafe] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!src) {
      setIsSafe(false);
      setIsLoading(false);
      return;
    }

    async function sanitize() {
      if (!src) {
        return;
      }

      setIsSafe(await urlSafe(src, {}));
      setIsLoading(false);
    }

    sanitize();
  }, [src]);

  return <img src={src} alt={alt}></img>;
}

interface UrlSafeOptions {
  allowedMimeTypes?: string[];
  timeout?: number;
}

async function urlSafe(url: string, options: UrlSafeOptions): Promise<boolean> {
  const { allowedMimeTypes, timeout = 5000 } = options;

  try {
    const blockedPatterns = [
      // Suspicious TLDs
      /\.(tk|ml|ga|cf)$/,

      // URL shorteners
      /^(bit\.ly|tinyurl\.com|t\.co|short\.link)$/,

      // Known malicious patterns
      /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/, // Raw IP addresses
      /localhost/,
      /127\.0\.0\.1/,
    ];

    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname.toLowerCase();

    const containsBlockedPattern = blockedPatterns.some((pattern) =>
      pattern.test(domain)
    );
    if (containsBlockedPattern) {
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          "User-Agent": "Dust-Bot/1.0 (Content-Type Validator)",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return false;
      }

      const contentType = response.headers.get("content-type");
      if (!contentType) {
        return false;
      }

      const baseMimeType = contentType.split(";")[0].trim().toLowerCase();

      if (allowedMimeTypes) {
        const isValidMimeType = allowedMimeTypes.some(
          (allowedType) => baseMimeType === allowedType.toLowerCase()
        );

        if (!isValidMimeType) {
          return false;
        }
      }

      return true;
    } catch (fetchError) {
      clearTimeout(timeoutId);

      return false;
    }
  } catch (parseError) {
    return false;
  }
}
