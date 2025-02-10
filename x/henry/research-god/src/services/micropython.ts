import { readFileSync } from "fs";
import { join } from "path";

interface MicroPythonExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  mp_js_init: (stackSize: number) => void;
  mp_js_do_str: (ptr: number) => void;
  mp_js_malloc: (size: number) => number;
  mp_js_free: (ptr: number) => void;
}

class MicroPython {
  private wasmInstance: WebAssembly.Instance | null = null;
  private memory: WebAssembly.Memory;
  private textEncoder: TextEncoder;
  private textDecoder: TextDecoder;
  private isInitialized = false;
  private output = "";
  private tempRet0 = 0;

  constructor() {
    this.memory = new WebAssembly.Memory({ initial: 256 }); // 16MB initial
    this.textEncoder = new TextEncoder();
    this.textDecoder = new TextDecoder();
  }

  private get exports(): MicroPythonExports {
    if (!this.wasmInstance) throw new Error("WASM instance not initialized");
    return this.wasmInstance.exports as unknown as MicroPythonExports;
  }

  private writeString(str: string): number {
    const bytes = this.textEncoder.encode(str + "\0");
    const ptr = this.exports.mp_js_malloc(bytes.length);
    new Uint8Array(this.memory.buffer).set(bytes, ptr);
    return ptr;
  }

  private captureOutput(ptr: number, len: number): string {
    const bytes = new Uint8Array(this.memory.buffer, ptr, len);
    return this.textDecoder.decode(bytes);
  }

  private nullFunc(signature: string) {
    return () => {
      throw new Error(
        `Invalid function pointer called with signature '${signature}'`
      );
    };
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load WASM module synchronously - faster cold start in Bun
      const wasmPath = join(import.meta.dir, "../wasm/micropython.wasm");
      const wasmBuffer = readFileSync(wasmPath);
      const wasmModule = await WebAssembly.compile(wasmBuffer);

      // Create import object with required functions
      const importObject = {
        env: {
          memory: this.memory,
          js_print: (ptr: number, len: number) => {
            this.output += this.captureOutput(ptr, len);
          },
          js_error: (ptr: number, len: number) => {
            const error = this.captureOutput(ptr, len);
            console.error(error);
          },
          js_ticks_ms: () => Date.now(),
          js_hook: () => {
            // Interrupt hook - could be used for Ctrl+C handling
          },
          abort: (what: any) => {
            console.error("Abort called:", what);
            throw new Error("WASM aborted: " + what);
          },
          setTempRet0: (value: number) => {
            this.tempRet0 = value;
          },
          getTempRet0: () => this.tempRet0,
          emscripten_memcpy_big: (dest: number, src: number, num: number) => {
            const heap = new Uint8Array(this.memory.buffer);
            heap.copyWithin(dest, src, src + num);
          },
          emscripten_resize_heap: (requestedSize: number) => false,
          emscripten_get_heap_size: () => this.memory.buffer.byteLength,
          stackAlloc: (size: number) => {
            // Simple stack allocation - in real implementation this would be more sophisticated
            const ptr = this.exports.mp_js_malloc(size);
            return ptr;
          },
          stackRestore: (top: number) => {
            // No-op for now
          },
          stackSave: () => {
            // Return a dummy value
            return 0;
          },
          abortStackOverflow: (size: number) => {
            throw new Error(
              `Stack overflow! Attempted to allocate ${size} bytes`
            );
          },
          abortStackOverflowEmterpreter: () => {
            throw new Error("Stack overflow in emterpreter!");
          },
          nullFunc_dd: this.nullFunc("dd"),
          nullFunc_ddd: this.nullFunc("ddd"),
          nullFunc_i: this.nullFunc("i"),
          nullFunc_ii: this.nullFunc("ii"),
          nullFunc_iidiiii: this.nullFunc("iidiiii"),
          nullFunc_iii: this.nullFunc("iii"),
          nullFunc_iiii: this.nullFunc("iiii"),
          nullFunc_iiiii: this.nullFunc("iiiii"),
          nullFunc_v: this.nullFunc("v"),
          nullFunc_vi: this.nullFunc("vi"),
          nullFunc_vii: this.nullFunc("vii"),
          nullFunc_viii: this.nullFunc("viii"),
          nullFunc_viiii: this.nullFunc("viiii"),
          nullFunc_viiiiii: this.nullFunc("viiiiii"),
        },
        global: {
          NaN,
          Infinity,
        },
        "global.Math": Math,
        asm2wasm: {},
      } as any;

      this.wasmInstance = await WebAssembly.instantiate(
        wasmModule,
        importObject
      );

      // Initialize with 64KB stack
      this.exports.mp_js_init(64 * 1024);

      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize MicroPython:", error);
      throw error;
    }
  }

  async runPython(code: string): Promise<string> {
    if (!this.isInitialized) {
      throw new Error("MicroPython not initialized");
    }

    try {
      this.output = ""; // Reset output
      const ptr = this.writeString(code);
      this.exports.mp_js_do_str(ptr);
      this.exports.mp_js_free(ptr);
      return this.output;
    } catch (error) {
      console.error("Failed to execute Python code:", error);
      throw error;
    }
  }

  terminate(): void {
    this.isInitialized = false;
    this.wasmInstance = null;
  }
}

// Export a singleton instance
export const micropython = new MicroPython();
