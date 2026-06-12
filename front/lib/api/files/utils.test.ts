import {
  FILE_UPLOAD_TIMEOUT_MS,
  parseUploadRequest,
} from "@app/lib/api/files/utils";
import { GCS_RESUMABLE_UPLOAD_THRESHOLD_BYTES } from "@app/lib/file_storage";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import type { IncomingMessage } from "http";
import { Readable } from "stream";
import { afterEach, assert, describe, expect, it, vi } from "vitest";

const BOUNDARY = "----vitestboundary";

function makeMultipartBody(content: Buffer, contentType: string): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="upload.bin"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`
    ),
    content,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

function makeUploadRequest(stream: Readable, contentLength: number) {
  return Object.assign(stream, {
    headers: {
      "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
      "content-length": String(contentLength),
    },
    // parseUploadRequest only reads the stream, the headers, and destroy();
    // a full IncomingMessage is not needed.
  }) as unknown as IncomingMessage;
}

describe("parseUploadRequest", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("buffers sub-threshold uploads and writes them with a replayable save", async () => {
    const { authenticator: auth } = await createResourceTest({
      role: "admin",
    });

    const file = await FileFactory.create(auth, null, {
      contentType: "application/pdf",
      fileName: "document.pdf",
      fileSize: 1000,
      status: "created",
      useCase: "conversation",
    });

    const content = Buffer.from("fake pdf bytes");
    const body = makeMultipartBody(content, "application/pdf");

    const result = await parseUploadRequest(
      auth,
      file,
      makeUploadRequest(Readable.from([body]), body.length)
    );

    assert(
      result.isOk(),
      `Expected Ok, got: ${result.isErr() ? JSON.stringify(result.error) : ""}`
    );

    // The payload is written via the buffered (replayable) save, not streamed.
    expect(fileStorageMock.writeStreamCalls).toHaveLength(0);
    const saves = fileStorageMock.saveFileCalls;
    expect(saves).toHaveLength(1);
    expect(saves[0].contentType).toBe("application/pdf");
    expect(Buffer.from(saves[0].content).equals(content)).toBe(true);
  });

  it("streams uploads at or above the resumable threshold", async () => {
    const { authenticator: auth } = await createResourceTest({
      role: "admin",
    });

    const file = await FileFactory.create(auth, null, {
      contentType: "application/pdf",
      fileName: "large.pdf",
      fileSize: GCS_RESUMABLE_UPLOAD_THRESHOLD_BYTES,
      status: "created",
      useCase: "conversation",
    });

    const body = makeMultipartBody(
      Buffer.from("fake large pdf bytes"),
      "application/pdf"
    );

    const result = await parseUploadRequest(
      auth,
      file,
      makeUploadRequest(Readable.from([body]), body.length)
    );

    assert(
      result.isOk(),
      `Expected Ok, got: ${result.isErr() ? JSON.stringify(result.error) : ""}`
    );

    // The payload is streamed straight to GCS (resumable upload).
    expect(fileStorageMock.writeStreamCalls).toHaveLength(1);
    expect(fileStorageMock.saveFileCalls).toHaveLength(0);
  });

  it("fails with an explicit error when the upload stalls", async () => {
    const { authenticator: auth } = await createResourceTest({
      role: "admin",
    });

    const file = await FileFactory.create(auth, null, {
      contentType: "application/pdf",
      fileName: "stalled.pdf",
      fileSize: 1000,
      status: "created",
      useCase: "conversation",
    });

    vi.useFakeTimers();

    // A request stream that never sends any data and never ends.
    const stalledStream = new Readable({ read() {} });
    const resultPromise = parseUploadRequest(
      auth,
      file,
      makeUploadRequest(stalledStream, 1000)
    );

    await vi.advanceTimersByTimeAsync(FILE_UPLOAD_TIMEOUT_MS + 1);

    const result = await resultPromise;
    assert(result.isErr(), "Expected Err, got Ok");
    expect(result.error.code).toBe("internal_server_error");
    expect(result.error.message).toBe("File upload timed out.");
  });
});
