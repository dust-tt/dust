import { MANAGED_SSE_HANDSHAKE_EVENT } from "@app/types/sse";
import type {
  Event as PolyfillEvent,
  MessageEvent as PolyfillMessageEvent,
} from "event-source-polyfill";
import { vi } from "vitest";

export class FakeEventSource {
  private readonly listeners = new Map<
    string,
    Set<(event: PolyfillEvent) => void>
  >();
  onerror: ((event: PolyfillEvent) => void) | null = null;
  onmessage: ((event: PolyfillMessageEvent) => void) | null = null;
  onopen: ((event: PolyfillEvent) => void) | null = null;
  readyState = 0;

  constructor(readonly url: string) {}

  addEventListener = (
    type: string,
    listener: (event: PolyfillEvent) => void
  ) => {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  };

  emitHandshake() {
    for (const listener of this.listeners.get(MANAGED_SSE_HANDSHAKE_EVENT) ??
      []) {
      listener({ type: MANAGED_SSE_HANDSHAKE_EVENT, target: this });
    }
  }

  emitMessage(data: string) {
    this.onmessage?.({ data, lastEventId: "", target: this, type: "message" });
  }

  close = vi.fn(() => {
    this.readyState = 2;
  });
}
