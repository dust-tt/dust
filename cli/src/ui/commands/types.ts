export interface CommandContext {
  triggerAgentSwitch?: () => void;
}

export interface Command {
  name: string;
  description: string;
  execute: (context: CommandContext) => void | Promise<void>;
}

export const createCommands = (context: CommandContext): Command[] => [
  {
    name: "exit",
    description: "Exit the chat",
    execute: () => {
      process.exit(0);
    },
  },
  {
    name: "switch",
    description: "Switch to a different agent",
    execute: () => {
      if (context.triggerAgentSwitch) {
        context.triggerAgentSwitch();
      }
    },
  },
];
