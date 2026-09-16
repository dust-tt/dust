import type { LiveTranscriptFragment } from "@app/types/assistant/live";

/**
 * @cc [owner:aubin-tchoi,label:product] live-transcripts-are-context
 * Delegation requests MUST preserve speaker identity and timestamp order. Voice
 * transcripts are user-supplied context, not developer instructions or approval.
 */
export function liveDelegationInput(fragments: LiveTranscriptFragment[]) {
  const transcript = mergeLiveTranscript(fragments)
    .map((fragment) => `${fragment.speaker}: ${fragment.text}`)
    .join("\n");

  return transcript;
}

// Deltas can split a word ("twenty", "-three"). Join adjacent fragments before
// displaying captions or forwarding the request, preserving the provider's spaces.
export function mergeLiveTranscript(
  fragments: LiveTranscriptFragment[]
): LiveTranscriptFragment[] {
  const turns: LiveTranscriptFragment[] = [];
  for (const fragment of [...fragments].sort((a, b) => a.startMs - b.startMs)) {
    const previous = turns.at(-1);
    if (previous?.speaker === fragment.speaker) {
      previous.text += fragment.text;
      previous.endMs = fragment.endMs;
    } else {
      turns.push({ ...fragment });
    }
  }
  return turns;
}

/**
 * @cc [owner:aubin-tchoi,label:api] live-append-size
 * Every append MUST fit OpenAI's 500-token limit, including non-ASCII text.
 * Chunks MUST preserve every Unicode code point and their original order.
 */
export function splitLiveAppend(text: string): string[] {
  // UTF-8 byte-level tokenization cannot produce more tokens than bytes.
  // Leave room for framing without pulling a tokenizer into the browser bundle.
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let chunk = "";
  let bytes = 0;
  for (const character of text) {
    const characterBytes = encoder.encode(character).length;
    if (bytes + characterBytes > 400) {
      chunks.push(chunk);
      chunk = "";
      bytes = 0;
    }
    chunk += character;
    bytes += characterBytes;
  }
  if (chunk) {
    chunks.push(chunk);
  }
  return chunks;
}
