/// <reference types="office-js" />
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// The only page of the auth dialog (`auth.ts`). It is on the add-in domain, as Office requires
// for the first page of a dialog and for `messageParent`.
const AUTH_DIALOG_PATH = "/excel/auth.html";

// Office errors are returned as `office_error_<number>`. The numbers are listed at
// https://learn.microsoft.com/en-us/office/dev/add-ins/develop/dialog-handle-errors-events
const officeError = (code: number | undefined) =>
  new Err(new Error(`office_error_${code ?? "unknown"}`));

// Reads the message that `auth.ts` sends: `code=<code>` or `error=<error>`. Office accepts
// `messageParent` only from the add-in domain and the domains in `<AppDomains>` of the manifest.
// If a domain that we do not trust is added there, check `arg.origin` here.
function readDialogMessage(
  arg: { message: string; origin: string | undefined } | { error: number }
): Result<string, Error> {
  if ("error" in arg) {
    return officeError(arg.error);
  }
  const message = new URLSearchParams(arg.message);
  const code = message.get("code");
  return code
    ? new Ok(code)
    : new Err(new Error(message.get("error") || "invalid_callback"));
}

// Opens the auth dialog and resolves with the authorization code that it sends. Must be called
// from a user click.
export function openAuthDialog({
  codeChallenge,
  organizationId,
}: {
  codeChallenge: string;
  organizationId?: string;
}): Promise<Result<string, Error>> {
  const params = new URLSearchParams({
    code_challenge: codeChallenge,
    ...(organizationId ? { organizationId } : {}),
  });
  const url = `${window.location.origin}${AUTH_DIALOG_PATH}?${params}`;

  return new Promise((resolve) => {
    Office.context.ui.displayDialogAsync(
      url,
      { height: 60, width: 30, displayInIframe: false },
      (asyncResult) => {
        if (asyncResult.status === Office.AsyncResultStatus.Failed) {
          resolve(officeError(asyncResult.error.code));
          return;
        }

        const dialog = asyncResult.value;

        dialog.addEventHandler(
          Office.EventType.DialogMessageReceived,
          (arg) => {
            dialog.close();
            resolve(readDialogMessage(arg));
          }
        );
        // Sent when the dialog fails or when the user closes it.
        dialog.addEventHandler(Office.EventType.DialogEventReceived, (arg) => {
          dialog.close();
          resolve(officeError("error" in arg ? arg.error : undefined));
        });
      }
    );
  });
}
