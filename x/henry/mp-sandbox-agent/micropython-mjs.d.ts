declare module "@micropython/micropython-webassembly-pyscript/micropython.mjs" {
  /**
   * Minimal shape of the object returned by `loadMicroPython`
   */
  export interface MicroPython {
    /**
     * Run Python code synchronously
     */
    runPythonAsync(code: string): Promise<void>;

    /**
     * Register a JavaScript object as importable from Python with the given name
     */
    registerJsModule(name: string, module: Record<string, unknown>): void;

    /**
     * Optionally, the runtime may support a set_stdout function
     */
    set_stdout(callback: (text: string) => void): void;

    /**
     * Optionally, the runtime may support a set_stderr function
     */
    set_stderr(callback: (err: string) => void): void;
    // ...other fields as needed...
  }

  export interface LoadMicroPythonOptions {
    url?: string; // optional path to the .wasm file
    stdout?: (text: string) => void;
    stderr?: (text: string) => void;
    linebuffer?: boolean;
    // ...
  }

  /**
   * Loads/initializes the MicroPython WASM runtime
   */
  export function loadMicroPython(
    opts?: LoadMicroPythonOptions
  ): Promise<MicroPythonInstance>;

  export interface MicroPythonOptions {
    /** Size in words of the MicroPython Python stack */
    pystack?: number;
    /** Size in bytes of the MicroPython GC heap */
    heapsize?: string;
    /** Location to load micropython.mjs */
    url?: string;
    /** Function to return input characters */
    stdin?: () => string;
    /** Function to handle stdout output lines */
    stdout?: (line: string) => void;
    /** Function to handle stderr output lines */
    stderr?: (line: string) => void;
    /** Whether to buffer line-by-line to stdout/stderr */
    linebuffer?: boolean;
  }

  export interface PyProxy {
    [key: string]: any;
  }

  export interface FSInterface {
    // Emscripten filesystem interface
    // Add specific methods as needed
  }

  export interface PythonGlobals {
    get(key: string): any;
    set(key: string, value: any): void;
    delete(key: string): void;
  }

  export interface MicroPythonInstance {
    /** The type of the object that proxies Python objects */
    PyProxy: typeof PyProxy;
    /** The Emscripten filesystem object */
    FS: FSInterface;
    /** Object exposing the globals from the Python __main__ module */
    globals: PythonGlobals;
    /** Register a JavaScript object as importable from Python with the given name */
    registerJsModule(name: string, module: Record<string, unknown>): void;
    /** Import a Python module and return it */
    pyimport(name: string): PyProxy;
    /** Execute Python code and return the result */
    runPython(code: string): any;
    /** Execute Python code and return the result, allowing for top-level await expressions */
    runPythonAsync(code: string): Promise<any>;
    /** Initialise the REPL */
    replInit(): void;
    /** Process an incoming character at the REPL */
    replProcessChar(chr: string): void;
    /** Process an incoming character at the REPL, for use when ASYNCIFY is enabled */
    replProcessCharWithAsyncify(chr: string): Promise<void>;
  }

  /**
   * Load and initialize MicroPython WebAssembly runtime
   * @param options Configuration options for MicroPython
   * @returns A Promise that resolves to the MicroPython instance
   */
  export function loadMicroPython(
    options?: MicroPythonOptions
  ): Promise<MicroPythonInstance>;
}
