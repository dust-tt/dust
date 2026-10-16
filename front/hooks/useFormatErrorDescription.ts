import { formatError } from "@app/lib/api_error_messages";
import { useCallback } from "react";

/**
 * @cc [owner:Nils-Fedrigo,label:error-handling;react] format-error-description-hook
 * The returned function MUST return the `description` of `formatError(error)`.
 */
export const useFormatErrorDescription = () => {
  return useCallback((error: unknown) => formatError(error).description, []);
};
