import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export function fireAndForgetNotification<E>(
  trigger: Promise<Result<void, E>>,
  {
    message,
    context,
  }: {
    message: string;
    context: Record<string, unknown>;
  }
): void {
  void trigger
    .then((res) => {
      if (res.isErr()) {
        logger.error({ ...context, error: res.error }, message);
      }
    })
    .catch((err) => {
      logger.error({ ...context, error: normalizeError(err) }, message);
    });
}
