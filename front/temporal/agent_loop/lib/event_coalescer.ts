import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import logger from "@app/logger/logger";
import type { GenerationTokensEvent } from "@app/types/assistant/generation";

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
 * Classification grouping:
 * - Only batches tokens with the same classification together
 * - When classification changes, the current buffer is flushed immediately
 * - Delimiters (opening/closing) bypass batching and flush any pending tokens
 *
 * Safety mechanisms:
 * - maxBufferAge: Forces flush after 60s to prevent stale buffers
 * - Periodic cleanup: Flushes and removes stale buffers every 5 minutes
 * - Delimiter events: Bypass coalescing and flush immediately
 */
class EventCoalescer {
  private buffers = new Map<string, BufferedEvent>();

  /**
   * Create a new buffer for a given key with the provided event.
   */
  private createBuffer({
    conversationId,
    event,
    key,
    step,
    flushIntervalMs,
  }: {
    conversationId: string;
    event: GenerationTokensEvent;
    key: string;
    step: number;
    flushIntervalMs: number;
  }): void {
    const timer = setTimeout(() => {
      void this.flush(key);
    }, flushIntervalMs);

    this.buffers.set(key, {
      latestEvent: event,
      accumulatedText: event.text,
      firstTokenAt: Date.now(),
      timer,
      conversationId,
      step,
    });
  }

  /**
   * Handle an event. generation_tokens are batched, other events are published immediately.
   */
  async handleEvent({
    conversationId,
    event,
    key,
    step,
    flushIntervalMs = FLUSH_INTERVAL_MS,
  }: {
    conversationId: string;
    event: AgentMessageEvents;
    key: string;
    step: number;
    flushIntervalMs?: number;
  }): Promise<void> {
    // Non-token events: flush any pending tokens for this key, then publish immediately.
    const isGenerationTokensEvent = event.type === "generation_tokens";
    const isDelimiterEvent =
      isGenerationTokensEvent &&
      (event.classification === "closing_delimiter" ||
        event.classification === "opening_delimiter");

    if (!isGenerationTokensEvent || isDelimiterEvent) {
      await this.flush(key);
      await publishConversationRelatedEvent({
        conversationId,
        event,
        step,
      });
      return;
    }

    // Token event: accumulate.
    const existing = this.buffers.get(key);
    if (!existing) {
      // First token in window, start new buffer.
      this.createBuffer({ key, conversationId, step, event, flushIntervalMs });
    } else {
      // If classification changed, flush existing buffer and start fresh.
      if (existing.latestEvent.classification !== event.classification) {
        await this.flush(key);

        // Start new buffer with this token classification.
        this.createBuffer({
          key,
          conversationId,
          step,
          event,
          flushIntervalMs,
        });
        return;
      }

      // Accumulate tokens with same classification.
      existing.accumulatedText += event.text;
      existing.latestEvent = event; // Keep latest metadata.

      // Safety: if buffer is too old, force flush.
      if (Date.now() - existing.firstTokenAt > MAX_BUFFER_AGE_MS) {
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

// Periodic cleanup every 5 minutes. Unref so it doesn't block shutdown.
// TODO: Remove once confident there is no memory leak.
setInterval(() => {
  void globalCoalescer.cleanup();
}, CLEANUP_INTERVAL_MS).unref();

export { globalCoalescer };
