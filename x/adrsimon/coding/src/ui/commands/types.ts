export interface CommandContext {
  clearConversation?: () => void;
  showHelp?: () => void;
  showStatus?: () => void;
}

export interface Command {
  name: string;
  description: string;
  execute: (context: CommandContext) => void | Promise<void>;
}

export const createCommands = (context: CommandContext): Command[] => [
  {
    name: "help",
    description: "Show commands and keyboard shortcuts",
    execute: () => {
      if (context.showHelp) {
        context.showHelp();
      }
    },
  },
  {
    name: "clear",
    description: "Clear conversation history",
    execute: () => {
      if (context.clearConversation) {
        context.clearConversation();
      }
    },
  },
  {
    name: "status",
    description: "Show token usage and session info",
    execute: () => {
      if (context.showStatus) {
        context.showStatus();
      }
    },
  },
  {
    name: "exit",
    description: "Exit the CLI",
    execute: () => {
      process.exit(0);
    },
  },
];
