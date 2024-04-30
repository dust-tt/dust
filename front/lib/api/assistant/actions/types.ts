import { Action } from "@app/lib/api/assistant/actions";

// This is a temporary typeguard until we refactor all actions.
export function isActionClass(maybeClass: unknown): maybeClass is Action {
  return maybeClass instanceof Action;
}
