/**
 * Grammar of a fully qualified pod function reference, `<podId>/<slug>`, as a Frame passes it to
 * `usePodFunction`.
 *
 * The slug half mirrors SANDBOX_FUNCTION_SLUG_REGEX in front
 * (`front/types/api/sandbox_functions.ts`): one optional `<app>__` prefix that publish derives from
 * the source's app folder, then the function's own name. `viz` cannot import from front, so
 * equality is asserted from front's side in `front/types/api/sandbox_functions.test.ts` — the same
 * arrangement as the runner protocol in `cli/dust-sandbox/functions-runner/protocol.ts`.
 *
 * Keeping this in step matters more than it looks: a reference this rejects resolves to a null SWR
 * key, so the Frame silently issues no request at all.
 */
const SLUG_SEGMENT = "[a-z0-9]+(?:-[a-z0-9]+)*";

export const POD_FUNCTION_REFERENCE_REGEX = new RegExp(
  `^[^/]+/${SLUG_SEGMENT}(?:__${SLUG_SEGMENT})?$`
);
