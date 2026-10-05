import {
  API_ERROR_MESSAGES,
  UNKNOWN_API_ERROR_MESSAGE,
} from "@app/lib/client/api_errors/display";
import { toDisplayableAPIError } from "@app/lib/client/api_errors/normalize";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";

/**
 * Returns a function turning any API error (thrown by `fetcher`, parsed from a response, or a
 * plain `Error`) into a translated sentence for the UI.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:error-handling;product] api-error-text-from-type
 * The text MUST be the translation of the error `type` (or a generic "Something went wrong." when
 * the type is unknown). When the error carries a server message, it MUST be appended verbatim as
 * raw context (`<translation> Raw message: "<message>".`); when it carries none, the translation
 * MUST be returned alone.
 */
export function useFormatAPIError(): (error: unknown) => string {
  const { t } = useLingui();

  return useCallback(
    (error: unknown) => {
      const { type, rawMessage: serverMessage } = toDisplayableAPIError(error);
      const typeMessage = t(
        type ? API_ERROR_MESSAGES[type] : UNKNOWN_API_ERROR_MESSAGE
      );
      if (!serverMessage) {
        return typeMessage;
      }
      const rawMessage = serverMessage.trim().replace(/\.+$/, "");
      return t`${typeMessage} Raw message: "${rawMessage}".`;
    },
    [t]
  );
}
