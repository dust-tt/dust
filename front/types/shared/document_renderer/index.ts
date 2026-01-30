import type { LoggerInterface } from "@app/types/shared/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export type PdfOrientation = "portrait" | "landscape";

export interface RenderTarget {
  url: string;
  waitForExpression: string;
}

export interface PdfOptions {
  footerHtml?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginRight?: string;
  marginTop?: string;
  orientation?: PdfOrientation;
  scale?: number;
}

export interface ScreenshotOptions {
  clip?: boolean;
  height?: number;
  width?: number;
}

export type DocumentRendererErrorCode = "render_failed" | "network_error";

export class DocumentRendererError extends Error {
  readonly code: DocumentRendererErrorCode;
  readonly status?: number;

  constructor(
    code: DocumentRendererErrorCode,
    message: string,
    status?: number
  ) {
    super(message);
    this.name = "DocumentRendererError";
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 30000;

const DEFAULT_PDF_OPTIONS: Omit<Required<PdfOptions>, "footerHtml"> = {
  marginBottom: "0",
  marginLeft: "0",
  marginRight: "0",
  marginTop: "0",
  orientation: "portrait",
  scale: 0.8,
};

// This matches Open Graph image dimensions for link previews.
const DEFAULT_SCREENSHOT_OPTIONS: Required<ScreenshotOptions> = {
  clip: true,
  height: 630,
  width: 1200,
};

/**
 * DocumentRenderer abstracts the underlying rendering service (Gotenberg) for generating
 * PDFs and screenshots from URLs.
 */
export class DocumentRenderer {
  constructor(
    readonly serviceUrl: string,
    readonly logger: LoggerInterface,
    readonly config: {
      timeoutMs?: number;
    } = {}
  ) {}

  private get timeoutMs(): number {
    return this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Export a URL to PDF.
   */
  async exportToPdf(
    target: RenderTarget,
    options: PdfOptions = {}
  ): Promise<Result<Buffer, DocumentRendererError>> {
    const {
      footerHtml,
      marginBottom,
      marginLeft,
      marginRight,
      marginTop,
      orientation,
      scale,
    } = { ...DEFAULT_PDF_OPTIONS, ...options };

    const formData = new FormData();
    formData.append("url", target.url);
    formData.append("waitForExpression", target.waitForExpression);
    formData.append("emulatedMediaType", "print"); // Apply @media print CSS rules.
    formData.append("scale", scale.toString());
    formData.append("printBackground", "true");
    formData.append("marginTop", marginTop);
    formData.append("marginBottom", marginBottom);
    formData.append("marginLeft", marginLeft);
    formData.append("marginRight", marginRight);

    if (footerHtml) {
      const footerBlob = new Blob([footerHtml], { type: "text/html" });
      formData.append("files", footerBlob, "footer.html");
    }

    if (orientation === "landscape") {
      formData.append("landscape", "true");
    }

    try {
      // eslint-disable-next-line no-restricted-globals
      const response = await fetch(
        `${this.serviceUrl}/forms/chromium/convert/url`,
        {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(this.timeoutMs),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          { status: response.status, error: errorText },
          "PDF export failed"
        );
        return new Err(
          new DocumentRendererError(
            "render_failed",
            `PDF export failed: ${errorText}`,
            response.status
          )
        );
      }

      const result = Buffer.from(await response.arrayBuffer());

      return new Ok(result);
    } catch (error) {
      this.logger.error({ error }, "PDF export network error");
      return new Err(
        new DocumentRendererError(
          "network_error",
          normalizeError(error).message
        )
      );
    }
  }

  /**
   * Capture a screenshot of a URL.
   */
  async captureScreenshot(
    target: RenderTarget,
    options: ScreenshotOptions = {}
  ): Promise<Result<Buffer, DocumentRendererError>> {
    const { clip, height, width } = {
      ...DEFAULT_SCREENSHOT_OPTIONS,
      ...options,
    };

    const formData = new FormData();
    formData.append("url", target.url);
    formData.append("waitForExpression", target.waitForExpression);
    formData.append("width", width.toString());
    formData.append("height", height.toString());
    formData.append("format", "png");

    if (clip) {
      formData.append("clip", "true");
    }

    try {
      // eslint-disable-next-line no-restricted-globals
      const response = await fetch(
        `${this.serviceUrl}/forms/chromium/screenshot/url`,
        {
          method: "POST",
          body: formData,
          signal: AbortSignal.timeout(this.timeoutMs),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          { status: response.status, error: errorText },
          "Screenshot capture failed"
        );
        return new Err(
          new DocumentRendererError(
            "render_failed",
            `Screenshot capture failed: ${errorText}`,
            response.status
          )
        );
      }

      return new Ok(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      this.logger.error({ error }, "Screenshot capture network error");
      return new Err(
        new DocumentRendererError(
          "network_error",
          normalizeError(error).message
        )
      );
    }
  }
}
