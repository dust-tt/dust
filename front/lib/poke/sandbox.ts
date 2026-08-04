import type { PokeSandboxType } from "@app/types/poke";

// E2B is the only sandbox provider, so its CLI is what operators attach with.
export function makeSandboxConnectCommand(sandbox: PokeSandboxType): string {
  return `e2b sandbox connect ${sandbox.providerId}`;
}
