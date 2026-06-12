// Worker entry shim: Vite's worker analysis needs a relative module URL
// (`new URL("./engine-worker.ts", import.meta.url)`), so this file exists
// only to pull in the real entry from the workspace package. Importing it
// registers the message handler and kicks off wasm init.
import "@dust/sheet-engine-worker";
