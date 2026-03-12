export interface CommandContext {
  triggerAgentSwitch?: () => void;
  attachFile?: () => void;
  clearFiles?: () => void;
  toggleAutoEdits?: () => void;
  startNewConversation?: () => void;
  showHelp?: () => void;
  resumeConversation?: () => void;
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
    name: "switch",
    description: "Switch to a different agent",
    execute: () => {
      if (context.triggerAgentSwitch) {
        context.triggerAgentSwitch();
      }
    },
  },
  {
    name: "new",
    description: "Start a new conversation",
    execute: () => {
      if (context.startNewConversation) {
        context.startNewConversation();
      }
    },
  },
  {
    name: "resume",
    description: "Resume a recent conversation",
    execute: () => {
      if (context.resumeConversation) {
        context.resumeConversation();
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
    name: "auto",
    description: "Toggle auto-approval of file edits on/off",
    execute: () => {
      if (context.toggleAutoEdits) {
        context.toggleAutoEdits();
      }
    },
  },
  {
    name: "exit",
    description: "Exit the chat",
    execute: () => {
      process.exit(0);
    },
  },
];
