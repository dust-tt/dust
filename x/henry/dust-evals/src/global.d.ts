// Augment Bun's AbortController types with Web API definitions
// This is needed because @types/bun doesn't include full Web API types

declare global {
  interface AbortController {
    readonly signal: AbortSignal
    abort(reason?: unknown): void
  }

  interface AbortSignal {
    readonly aborted: boolean
    readonly reason: unknown
    onabort: ((this: AbortSignal, ev: Event) => unknown) | null
    throwIfAborted(): void
  }

  // eslint-disable-next-line no-var
  var AbortController: {
    prototype: AbortController
    new (): AbortController
  }
}

export {}
