/// <reference lib="webworker" />
import { WorkerMessage } from "../types/interpreter";

// Import MicroPython WASM module
const micropythonJs = new URL("../wasm/micropython.js", import.meta.url);
const micropythonWasm = new URL("../wasm/micropython.wasm", import.meta.url);

// Capture output
let capturedOutput = "";

// Mock require for MicroPython
(self as any).require = (module: string) => {
  if (module === "fs") {
    return {
      readFileSync: (path: string) => {
        if (path.endsWith("micropython.binary")) {
          return new Uint8Array(0); // Empty binary for now
        }
        return new Uint8Array();
      },
      writeFileSync: () => {},
      existsSync: () => false,
    };
  }
  if (module.startsWith("./") || module.startsWith("/")) {
    return new Uint8Array();
  }
  if (module === "path") {
    return {
      join: (...parts: string[]) => parts.join("/"),
      dirname: (path: string) => path.split("/").slice(0, -1).join("/"),
    };
  }
  throw new Error(`Module ${module} not found`);
};

// Mock process for MicroPython
(self as any).process = {
  platform: "web",
  cwd: () => "/",
  env: {},
};

// MicroPython Module type
interface MicroPythonModule {
  init: (stackSize: number) => void;
  do_str: (code: string) => Promise<string>;
  init_python: (stackSize: number) => Promise<void>;
}

declare var mp_js: Promise<MicroPythonModule>;
let moduleInstance: MicroPythonModule | null = null;

// Create MicroPython instance
async function createInstance(): Promise<MicroPythonModule> {
  if (moduleInstance) {
    return moduleInstance;
  }

  console.log("Creating MicroPython instance...");

  // Load MicroPython JS
  console.log("Loading MicroPython JS...");
  const jsResponse = await fetch(micropythonJs);
  const jsCode = await jsResponse.text();
  console.log("MicroPython JS loaded:", jsCode.length, "bytes");

  // Add mock require before evaluating
  const wrappedCode = `
    const __dirname = '/';
    const require = (module) => {
      if (module === 'fs') {
        return {
          readFileSync: (path) => {
            if (path.endsWith('micropython.binary')) {
              return new Uint8Array(0); // Empty binary for now
            }
            return new Uint8Array();
          },
          writeFileSync: () => {},
          existsSync: () => false,
        };
      }
      if (module.startsWith('./') || module.startsWith('/')) {
        return new Uint8Array();
      }
      if (module === 'path') {
        return {
          join: (...parts) => parts.join('/'),
          dirname: (path) => path.split('/').slice(0, -1).join('/'),
        };
      }
      throw new Error('Module ' + module + ' not found');
    };
    const process = {
      platform: 'web',
      cwd: () => '/',
      env: {},
    };
    ${jsCode}
  `;

  // Evaluate the JS code
  console.log("Evaluating MicroPython JS...");
  try {
    const evaluateJs = new Function(wrappedCode);
    evaluateJs();
  } catch (error) {
    console.error("Error evaluating MicroPython JS:", error);
    throw error;
  }

  // Initialize MicroPython
  const instance = await mp_js;
  instance.init(64 * 1024); // Initialize with 64KB stack
  await instance.init_python(64 * 1024); // Initialize Python API

  moduleInstance = instance;
  return moduleInstance;
}

// Handle messages from main thread
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  console.log("Received message:", e.data);
  capturedOutput = ""; // Reset output

  try {
    const module = await createInstance();
    console.log("MicroPython instance ready");

    // Execute Python code
    console.log("Executing Python code:", e.data.code);
    const output = await module.do_str(e.data.code);
    console.log("Python code executed");

    // Send success response
    console.log("Sending success response with output:", output);
    self.postMessage({ success: true, output });
  } catch (error) {
    // Send error response
    console.error("Error in worker:", error);
    self.postMessage({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      output: capturedOutput,
    });
  }
};
