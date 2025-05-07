import {
  ArrowPathIcon,
  Button,
  Chip,
  DocumentPileIcon,
  EyeIcon,
  Popover,
} from "@dust-tt/sparkle";

import { useSubmitFunction } from "@app/lib/client/utils";
import { truncate } from "@app/types/shared/utils/string_utils";

interface ErrorMessageProps {
  error: { code: string; message: string };
  retryHandler: () => void;
}

export function ErrorMessage({ error, retryHandler }: ErrorMessageProps) {
  const fullMessage =
    "ERROR: " + error.message + (error.code ? ` (code: ${error.code})` : "");

  const { submit: retry, isSubmitting: isRetrying } = useSubmitFunction(
    async () => retryHandler()
  );

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-1 sm:flex-row">
        <Chip
          color="warning"
          label={"ERROR: " + truncate(error.message, 30)}
          size="xs"
        />
        <Popover
          trigger={
            <Button
              variant="outline"
              size="xs"
              icon={EyeIcon}
              label="See the error"
            />
          }
          content={
            <div className="flex flex-col gap-3">
              <div className="whitespace-normal break-words text-sm font-normal text-warning-800">
                {fullMessage}
              </div>
              <div className="self-end">
                <Button
                  variant="ghost"
                  size="xs"
                  icon={DocumentPileIcon}
                  label={"Copy"}
                  onClick={() =>
                    void navigator.clipboard.writeText(fullMessage)
                  }
                />
              </div>
            </div>
          }
        />
      </div>
      <div>
        <Button
          variant="outline"
          size="sm"
          icon={ArrowPathIcon}
          label="Retry"
          onClick={retry}
          disabled={isRetrying}
        />
      </div>
    </div>
  );
}
