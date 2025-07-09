export interface LoggerInterface {
  error: (args: Record<string, unknown>, message: string) => void;
  info: (args: Record<string, unknown>, message: string) => void;
  trace: (args: Record<string, unknown>, message: string) => void;
  warn: (args: Record<string, unknown>, message: string) => void;
}
