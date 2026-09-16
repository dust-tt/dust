/**
 * Grammar of the references a Frame passes to `useFrameFunction`.
 *
 * A reference is a bare function name, exactly as the Frame's manifest declares it. The host
 * qualifies it against the calling Frame's trusted identity — `resolveFrameFunctionReference` in
 * `front/types/api/frame_function_reference.ts` turns `list-notes` into `<frameId>/list-notes` —
 * so the Frame never names the Frame it is calling into, and cannot name another one.
 *
 * This deliberately accepts less than front's `SANDBOX_FUNCTION_SLUG_REGEX`, which still admits an
 * optional `<app>__` prefix. That prefix belonged to the app-folder resolution Pod functions used;
 * a v2 Frame's slug is its bare manifest name (`createForFramePublication` sets `slug: fn.name`),
 * and a publish whose UI passes anything else fails `validateFrameFunctionReferences`. Accepting
 * the wider form here only delayed the refusal until the host rejected the RPC.
 *
 * `viz` cannot import from front, so this is checked against front's bare-name regex from front's
 * side in `front/types/api/sandbox_functions.test.ts` — the same arrangement as the runner protocol
 * in `cli/dust-sandbox/functions-runner/protocol.ts`.
 *
 * Keeping this in step matters more than it looks: a reference this rejects resolves to a null SWR
 * key, so the Frame silently issues no request at all.
 */
export const FRAME_FUNCTION_REFERENCE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether `reference` is a bare manifest function name the host can qualify. */
export function isFrameFunctionReference(reference: string): boolean {
  return FRAME_FUNCTION_REFERENCE_REGEX.test(reference);
}
