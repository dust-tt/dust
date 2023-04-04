import logger from "@app/logger/logger";

export async function* streamChunks(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      yield value;
    }
  } catch (e) {
    logger.error(
      {
        error: e,
      },
      "Error streaming chunks"
    );
  } finally {
    reader.releaseLock();
  }
}
