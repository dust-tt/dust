import { Buffer } from "buffer";

// Must be loaded before any @dust-tt/client import.
// The SDK uses z.instanceof(Buffer) at module init and Buffer.from() in file downloads.
globalThis.Buffer = Buffer as unknown as typeof globalThis.Buffer;
