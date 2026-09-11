import type { PopupResult } from "@extension/shared/services/popup_auth";

const DIALOG_CONFIG = {
  // Percentages of the Excel window, as required by `displayDialogAsync`.
  HEIGHT: 60,
  WIDTH: 30,
} as const;

/**
 * True when running inside an Office host that can open a dialog window.
 *
 * The task pane runs in a WebView (Excel on desktop) or a sandboxed iframe
 * (Excel on the web) where `window.open` is unreliable or outright blocked, so
 * the Office Dialog API is the supported way to run an OAuth flow. When the
 * page is instead opened directly in a browser — which is how the task pane is
 * usually developed — Office.js is present but `Office.context.ui` is not, and
 * callers fall back to a plain popup.
 */
export function isOfficeDialogAvailable(): boolean {
  return (
    typeof Office !== "undefined" &&
    typeof Office.context?.ui?.displayDialogAsync === "function"
  );
}

/**
 * Human-readable reasons for the dialog error codes Office reports through
 * `DialogEventReceived`.
 *
 * Only `12006` is the user closing the window; the rest are the host refusing
 * a page, and reporting them as a cancellation hides the actual failure — the
 * dialog is replaced by Office's generic "we can't load the add-in" screen, so
 * this code is the only signal left.
 */
const DIALOG_EVENT_REASONS: Record<number, string> = {
  12002:
    "the sign-in page could not be loaded (unreachable URL, invalid syntax, " +
    "or a domain missing from the manifest's AppDomains)",
  12003:
    "the sign-in page was reached over HTTP; an Office dialog requires HTTPS " +
    "for every page it navigates to",
  12006: "the window was closed",
  12009: "the host declined to show the dialog",
};

/**
 * @cc [owner:Nils-Fedrigo,label:error-handling] dialog-events-report-their-code
 * A `DialogEventReceived` handler must surface the event's numeric code rather
 * than collapse every event into a cancellation: the codes distinguish a user
 * closing the window from the host refusing the page, and the dialog itself is
 * replaced by Office's generic error screen when that happens.
 */
function describeDialogEvent(error: number): Error {
  const reason = DIALOG_EVENT_REASONS[error];

  return new Error(
    reason
      ? `Sign-in stopped: ${reason} (Office dialog error ${error}).`
      : `Sign-in stopped with Office dialog error ${error}.`
  );
}

/**
 * Turns either dialog event into a result, without throwing.
 *
 * Office types `DialogMessageReceived` and `DialogEventReceived` handlers with
 * the same event union, so both settle through here.
 */
function dialogEventToResult<T>(
  event: { message: string; origin: string | undefined } | { error: number }
): PopupResult<T> {
  // Only the message shape carries `message`; the other reports a host error.
  if (!("message" in event)) {
    return { error: describeDialogEvent(event.error) };
  }

  try {
    const payload = JSON.parse(event.message);

    // The relay reports a provider-side failure as `{ error }`.
    return typeof payload?.error === "string"
      ? { error: new Error(payload.error) }
      : { data: payload };
  } catch {
    return { error: new Error("Malformed message from the sign-in dialog") };
  }
}

/**
 * Opens `url` in an Office dialog and resolves once the page inside it posts a
 * message back with `Office.context.ui.messageParent`.
 *
 * `url` must be HTTPS and served from the add-in's own domain, otherwise the
 * host refuses to open it. It is expected to be our `auth.html` relay, which
 * bounces to the identity provider and messages the payload back once the
 * provider redirects to it.
 */
export function openOfficeDialog<T>(url: string): Promise<PopupResult<T>> {
  return new Promise((resolve) => {
    Office.context.ui.displayDialogAsync(
      url,
      { height: DIALOG_CONFIG.HEIGHT, width: DIALOG_CONFIG.WIDTH },
      (asyncResult) => {
        if (asyncResult.status === Office.AsyncResultStatus.Failed) {
          resolve({
            error: new Error(
              `Could not open the sign-in dialog: ${asyncResult.error.message}`
            ),
          });
          return;
        }

        const dialog = asyncResult.value;

        // The relay page messages us the payload once it has it.
        dialog.addEventHandler(
          Office.EventType.DialogMessageReceived,
          (event) => {
            // Settle before closing, in this order deliberately. `close()`
            // raises `DialogEventReceived` on some hosts, and a promise keeps
            // its first settlement, so closing first lets the dialog-event
            // handler below discard the code we just received. `close()` can
            // also throw, which would strand this promise and leave the dialog
            // open on its final page.
            resolve(dialogEventToResult<T>(event));

            try {
              dialog.close();
            } catch (err) {
              console.error("[Dust Auth] Failed to close sign-in dialog:", err);
            }
          }
        );

        // Fires when the user closes the dialog, or the host tears it down —
        // including when it refuses to load a page, which is reported here
        // rather than through the `displayDialogAsync` callback. A no-op once a
        // message has already settled the promise above.
        dialog.addEventHandler(
          Office.EventType.DialogEventReceived,
          (event) => {
            resolve(dialogEventToResult<T>(event));
          }
        );
      }
    );
  });
}
