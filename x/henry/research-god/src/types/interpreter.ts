export interface ExecutionResult {
  output: string;
  error?: string;
}

export interface HostFunction {
  name: string;
  func: (...args: any[]) => Promise<any> | any;
}

export interface InterpreterOptions {
  timeout?: number;
  memoryLimit?: number;
  allowedModules?: string[];
}

export interface WorkerMessage {
  code: string;
  options: {
    memoryLimit: number;
    allowedModules: string[];
    hostFunctions?: string[];
  };
}
