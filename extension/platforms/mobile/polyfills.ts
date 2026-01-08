// Polyfills for React Native
// Must be imported before any other code that uses Node.js globals

import { Buffer } from "buffer";

// Make Buffer available globally
if (typeof global !== "undefined") {
  (global as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}
