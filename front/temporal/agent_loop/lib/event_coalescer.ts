import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import logger from "@app/logger/logger";
import type { GenerationTokensEvent } from "@app/types";

const FLUSH_INTERVAL_MS = 100;
const MAX_BUFFER_AGE_MS = 60_000; // 1 minute
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface BufferedEvent {
  latestEvent: GenerationTokensEvent;
  accumulatedText: string;
  firstTokenAt: number;
  timer: NodeJS.Timeout;
  // Store metadata to avoid parsing key
  conversationId: string;
  step: number;
}

/**
 * EventCoalescer batches generation_tokens events to reduce Redis writes
 * and function call overhead. Buffers tokens for 100ms before publishing.
 *
 * Safety mechanisms:
 * - maxBufferAge: Forces flush after 60s
 * - Periodic cleanup: Flushes and removes stale buffers every 5 minutes
 * - Terminal events: Bypass coalescing and flush immediately
 */
class EventCoalescer {
  private buffers = new Map<string, BufferedEvent>();

  /**
   * Handle an event. generation_tokens are batched, other events are passed through immediately to
   * the publishFn callback.
   */
  async handleEvent(
    key: string,
    conversationId: string,
    step: number,
    event: AgentMessageEvents,
    publishFn: (coalescedEvent: AgentMessageEvents) => Promise<void>
  ): Promise<void> {
    // Non-token events: flush any pending tokens for this key, then publish immediately.
    if (event.type !== "generation_tokens") {
      await this.flush(key);
      await publishFn(event);
      return;
    }

    // Token event: accumulate.
    const existing = this.buffers.get(key);
    if (!existing) {
      // First token in window, start new buffer.
      const timer = setTimeout(() => {
        void this.flush(key);
      }, FLUSH_INTERVAL_MS);

      this.buffers.set(key, {
        latestEvent: event,
        accumulatedText: event.text,
        firstTokenAt: Date.now(),
        timer,
        conversationId,
        step,
      });
    } else {
      // Accumulate tokens.
      existing.accumulatedText += event.text;
      existing.latestEvent = event; // Keep latest metadata (classification, etc.)

      // Safety: if buffer is too old, force flush.
      if (Date.now() - existing.firstTokenAt > MAX_BUFFER_AGE_MS) {
        clearTimeout(existing.timer);
        await this.flush(key);
      }
    }
  }

  /**
   * Flush a specific buffer, publishes the accumulated tokens.
   */
  private async flush(key: string): Promise<void> {
    const buffered = this.buffers.get(key);
    if (!buffered) {
      return;
    }

    this.buffers.delete(key);
    clearTimeout(buffered.timer);

    // Publish single coalesced event with all accumulated text
    const coalescedEvent: GenerationTokensEvent = {
      ...buffered.latestEvent,
      text: buffered.accumulatedText,
      created: Date.now(), // Update timestamp.
    };

    await publishConversationRelatedEvent({
      conversationId: buffered.conversationId,
      event: coalescedEvent,
      step: buffered.step,
    });
  }

  /**
   * Cleanup stale buffers, flushes and removes buffers older than maxBufferAge.
   * Called periodically to prevent memory leaks.
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    const staleKeys: string[] = [];

    for (const [key, buffer] of this.buffers.entries()) {
      if (now - buffer.firstTokenAt > MAX_BUFFER_AGE_MS) {
        staleKeys.push(key);
      }
    }

    if (staleKeys.length > 0) {
      logger.info(
        { count: staleKeys.length },
        "Cleaning up stale event coalescer buffers"
      );

      for (const key of staleKeys) {
        await this.flush(key);
      }
    }
  }
}

// Singleton instance.
const globalCoalescer = new EventCoalescer();

// Periodic cleanup every 5 minutes.
setInterval(() => {
  void globalCoalescer.cleanup();
}, CLEANUP_INTERVAL_MS);

export { globalCoalescer };
