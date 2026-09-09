/**
 * Entry point for `auth.html`, the OAuth relay page for the Excel add-in.
 *
 * It is loaded twice during a sign-in:
 *
 *  1. The task pane opens it (in an Office dialog, or a popup when developing
 *     in a plain browser) with `?authUrl=<identity provider URL>`. It simply
 *     forwards the window there.
 *  2. The identity provider redirects back to this page with `?code=<code>`.
 *     Inside an Office dialog we hand the code to the task pane with
 *     `messageParent`; in the popup fallback we do nothing and let the opener
 *     read the code off our URL, the way the Front plugin does.
 *
 * The page exists because an Office dialog can only message the task pane from
 * a page served on the add-in's own domain, so the flow cannot end on the
 * identity provider's page.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:security] auth-relay-forwards-to-https-only
 * The `authUrl` this relay forwards to must be HTTPS. An Office dialog rejects
 * an HTTP page with error 12003 and replaces the relay with the host's generic
 * "we can't load the add-in" screen, which also destroys the on-screen log
 * below — so an HTTP target fails with no usable diagnostic in the dialog.
 */

const isDevelopment = process.env.NODE_ENV !== "production";

const setStatus = (text: string) => {
  const statusElement = document.getElementById("status");
  if (statusElement) {
    statusElement.textContent = text;
  }
};

/**
 * Appends a diagnostic line to the page.
 *
 * An Office dialog has no reachable developer console on macOS unless the
 * `OfficeWebAddinDeveloperExtras` default is enabled, so in development the
 * relay reports its own progress on screen.
 */
const log = (line: string) => {
  if (!isDevelopment) {
    return;
  }

  const logElement = document.getElementById("log");
  if (logElement) {
    logElement.hidden = false;
    logElement.textContent += `${line}\n`;
  }
};

/**
 * Reveals a link the user can click to continue by hand.
 *
 * A user-initiated navigation is accepted in contexts that discard a scripted
 * one, so this is the escape hatch when forwarding is refused, and clicking it
 * distinguishes a refused navigation from a wrong target URL.
 */
const offerManualNavigation = (url: string) => {
  const fallback = document.getElementById("fallback");
  const link = document.getElementById("fallback-link");

  if (fallback && link instanceof HTMLAnchorElement) {
    link.href = url;
    fallback.hidden = false;
  }
};

/**
 * How long to wait for Office.js before assuming we are not in an Office host.
 *
 * `Office.onReady` never resolves outside one — the popup fallback used when the
 * task pane is opened in a plain browser — so the wait needs a floor. It is
 * deliberately long: inside a dialog `onReady` has to be the signal that wins.
 */
const OFFICE_READY_FALLBACK_MS = 5000;

/**
 * Whether to stop before forwarding to the identity provider.
 *
 * A dialog that fails to load a page is replaced by Office's generic
 * "we can't load the add-in" screen, which destroys this page and its log —
 * so a failed *initial* load and a failed *forward* look identical from the
 * task pane, which only sees error 12002 either way. Holding here separates
 * them: if this page is on screen, the initial load worked.
 *
 * Set back to `false` once the failing hop is known; sign-in needs a click
 * while it is `true`.
 */
const HOLD_FOR_DIAGNOSIS = false;

/**
 * Resolves once the host is ready to be navigated or messaged.
 *
 * Waiting on `onReady` is load-bearing for both legs of the flow, for two
 * different reasons: `messageParent` does not exist before it resolves, and a
 * navigation issued before it resolves is discarded by the dialog — observed
 * with a synchronous `location.replace`, with one issued from the `load`
 * handler, and with one issued from a short timer.
 */
const whenHostReady = (): Promise<void> => {
  if (typeof Office === "undefined") {
    log("office.js absent — popup fallback");
    return Promise.resolve();
  }

  return Promise.race([
    Office.onReady().then(() => log("office.js ready")),
    new Promise<void>((resolve) =>
      setTimeout(() => {
        log(`office.js still not ready after ${OFFICE_READY_FALLBACK_MS}ms`);
        resolve();
      }, OFFICE_READY_FALLBACK_MS)
    ),
  ]);
};

/** Posts the payload back to the task pane, if we were opened as a dialog. */
const messageTaskPane = (payload: Record<string, string>): void => {
  // Only available when we were opened as an Office dialog; in the popup
  // fallback the opener polls our URL instead.
  if (typeof Office.context?.ui?.messageParent === "function") {
    log("posting to task pane");
    Office.context.ui.messageParent(JSON.stringify(payload));
  } else {
    log("messageParent unavailable — opener polls this URL instead");
  }
};

const relay = () => {
  log(`relay ${window.location.href}`);

  const params = new URLSearchParams(window.location.search);

  const code = params.get("code");
  const error = params.get("error");

  if (!code && !error) {
    const authUrl = params.get("authUrl");
    if (!authUrl) {
      setStatus("Nothing to do here. You can close this window.");
      return;
    }

    // Refuse an HTTP target rather than let the dialog swap itself for the
    // host's error screen, which would take this log with it.
    if (!authUrl.startsWith("https://")) {
      setStatus(
        "Sign-in cannot start: the Dust URL this add-in was built against is " +
          "not HTTPS, and an Office dialog only loads HTTPS pages."
      );
      log(`refusing non-HTTPS target ${authUrl}`);
      return;
    }

    setStatus(
      HOLD_FOR_DIAGNOSIS ? "Ready to sign in." : "Opening sign-in\u2026"
    );
    offerManualNavigation(authUrl);
    log(`forwarding to ${authUrl}`);

    void whenHostReady().then(() => {
      if (HOLD_FOR_DIAGNOSIS) {
        // Reaching this line at all proves the dialog can load the relay, so
        // a failure after the click is the forward, not the initial load.
        log("holding — click the link above to forward by hand");
        return;
      }

      log("navigating now");
      // `replace` rather than `assign` so the provider's page does not leave
      // this relay in the dialog's history.
      window.location.replace(authUrl);
    });
    return;
  }

  const payload: Record<string, string> = code
    ? { code }
    : { error: params.get("error_description") ?? error ?? "unknown_error" };

  setStatus(
    code
      ? "Signing you in…"
      : `Sign-in failed: ${payload.error}. You can close this window.`
  );

  void whenHostReady().then(() => messageTaskPane(payload));
};

relay();
