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
    console.log("Error streaming chunks", e);
  } finally {
    reader.releaseLock();
  }
}
