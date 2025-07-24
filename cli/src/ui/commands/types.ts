export interface CommandContext {
  triggerAgentSwitch?: () => void;
  attachFile?: () => void;
  clearFiles?: () => void;
  toggleAutoEdits?: () => void;
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
  {
    name: "attach",
    description: "Open file selector to attach a file",
    execute: () => {
      if (context.attachFile) {
        context.attachFile();
      }
    },
  },
  {
    name: "clear-files",
    description: "Clear any attached files",
    execute: () => {
      if (context.clearFiles) {
        context.clearFiles();
      }
    },
  },
  {
    name: "toggle-auto-edits",
    description: "Toggle auto-approval of file edits on/off",
    execute: () => {
      if (context.toggleAutoEdits) {
        context.toggleAutoEdits();
      }
    },
  },
];
