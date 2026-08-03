import { apiError } from "@front-api/middlewares/utils";
import { bodyLimit as honoBodyLimit } from "hono/body-limit";

/**
 * Wraps Hono's `bodyLimit` so an over-limit request returns our standard
 * `{ error: { type, message } }` envelope with a 413 status instead of the
 * default plain-text "Payload Too Large" body. Mirrors the declarative
 * `bodyParser.sizeLimit` config that the Next.js handlers used.
 */
export function bodyLimit(maxSizeBytes: number) {
  return honoBodyLimit({
    maxSize: maxSizeBytes,
    onError: (ctx) =>
      apiError(ctx, {
        status_code: 413,
        api_error: {
          type: "content_too_large",
          message: "Request body too large.",
        },
      }),
  });
}
