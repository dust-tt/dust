/**
 * Grammar of the references a Frame passes to `usePodFunction`.
 *
 * **Fully qualified** — `<podId>/<slug>`. Works from any Frame, and is the only form that can name a
 * function in another Pod. The slug half mirrors SANDBOX_FUNCTION_SLUG_REGEX in front
 * (`front/types/api/sandbox_functions.ts`): one optional `<app>__` prefix that publish derives from
 * the source's app folder, then the function's own name.
 *
 * **Relative** — a bare `<name>`, no `/` and no `__` prefix. The host resolves it against the app
 * folder the calling Frame lives in, so `list-notes` inside `pod-x/TaskList/TaskList.tsx` reaches
 * `pod-x/tasklist__list-notes`. This is what lets an app be copied or renamed without editing the
 * Frame's source. Only a Frame inside an app folder has a scope to resolve against; anywhere else the
 * host refuses the call, so a Frame at the Pod root or in a conversation must stay fully qualified.
 *
 * The two forms are separate patterns on purpose rather than one with an optional `<podId>/`: that
 * would also admit a prefixed-but-podless `tasklist__list-notes`, and dropping the prefix is the whole
 * point of the relative form.
 *
 * `viz` cannot import from front, so equality with front's grammar is asserted from front's side in
 * `front/types/api/sandbox_functions.test.ts` — the same arrangement as the runner protocol in
 * `cli/dust-sandbox/functions-runner/protocol.ts`.
 *
 * Keeping this in step matters more than it looks: a reference this rejects resolves to a null SWR
 * key, so the Frame silently issues no request at all.
 */
const SLUG_SEGMENT = "[a-z0-9]+(?:-[a-z0-9]+)*";

export const POD_FUNCTION_REFERENCE_REGEX = new RegExp(
  `^[^/]+/${SLUG_SEGMENT}(?:__${SLUG_SEGMENT})?$`
);

export const POD_FUNCTION_RELATIVE_REFERENCE_REGEX = new RegExp(
  `^${SLUG_SEGMENT}$`
);

/** Whether `reference` is a reference the host can act on, in either form. */
export function isPodFunctionReference(reference: string): boolean {
  return (
    POD_FUNCTION_REFERENCE_REGEX.test(reference) ||
    POD_FUNCTION_RELATIVE_REFERENCE_REGEX.test(reference)
  );
}
