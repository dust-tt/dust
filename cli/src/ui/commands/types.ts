export interface Command {
  name: string;
  description: string;
  execute: () => void | Promise<void>;
}

export const AVAILABLE_COMMANDS: Command[] = [
  {
    name: "exit",
    description: "Exit the chat",
    execute: () => {
      process.exit(0);
    },
  },
];