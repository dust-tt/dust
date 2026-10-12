/// <reference types="office-js" />
import { assertNever } from "@app/types/shared/utils/assert_never";
import { DUST_US_URL } from "@extension/shared/lib/config";

// The only page of the Office auth dialog. It is opened twice:
// 1. By the task pane, with the PKCE challenge: it goes to the Dust login.
// 2. By the login redirect: it sends `code` or `error` to the task pane. Any URL without a PKCE
//    challenge sends a message, so a wrong URL gives an error, not a new login.
const OFFICE_JS_URL =
  "https://officeapis.public.onecdn.static.microsoft/1/office.js";

type AuthPageAction =
  | { kind: "login"; codeChallenge: string; organizationId: string | null }
  | { kind: "send_code"; code: string }
  | { kind: "send_error"; error: string };

const getAction = (): AuthPageAction => {
  const query = new URLSearchParams(window.location.search);
  const codeChallenge = query.get("code_challenge");
  if (codeChallenge) {
    return {
      kind: "login",
      codeChallenge,
      organizationId: query.get("organizationId"),
    };
  }
  const code = query.get("code");
  if (code) {
    return { kind: "send_code", code };
  }
  return {
    kind: "send_error",
    error: query.get("error") || "invalid_callback",
  };
};

const goToLogin = (codeChallenge: string, organizationId: string | null) => {
  const loginParams = new URLSearchParams({
    // This page is also the redirect target of the login.
    redirect_uri: `${window.location.origin}${window.location.pathname}`,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    ...(organizationId ? { organizationId } : {}),
  });
  window.location.replace(`${DUST_US_URL}/api/workos/login?${loginParams}`);
};

// Sends `code=<code>` or `error=<error>` to the task pane, which reads it in `openAuthDialog`.
// Office.js is loaded only here: the first visit does not need it.
const sendToTaskPane = (message: { code: string } | { error: string }) => {
  const script = document.createElement("script");
  script.src = OFFICE_JS_URL;
  script.onload = () => {
    void Office.onReady().then(() => {
      Office.context.ui.messageParent(new URLSearchParams(message).toString());
    });
  };
  document.head.appendChild(script);
};

const action = getAction();
switch (action.kind) {
  case "login":
    goToLogin(action.codeChallenge, action.organizationId);
    break;
  case "send_code":
    sendToTaskPane({ code: action.code });
    break;
  case "send_error":
    sendToTaskPane({ error: action.error });
    break;
  default:
    assertNever(action);
}
