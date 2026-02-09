export interface CommandContext {
  triggerAgentSwitch?: () => void;
  attachFile?: () => void;
  clearFiles?: () => void;
  toggleAutoEdits?: () => void;
  clearConversation?: () => void;
  startNewConversation?: () => void;
  showHelp?: () => void;
  showInfo?: () => void;
  showHistory?: () => void;
  resumeConversation?: () => void;
  exportConversation?: () => void;
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
    name: "history",
    description: "List recent conversations",
    execute: () => {
      if (context.showHistory) {
        context.showHistory();
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
    name: "clear",
    description: "Clear conversation display",
    execute: () => {
      if (context.clearConversation) {
        context.clearConversation();
      }
    },
  },
  {
    name: "info",
    description: "Show current agent and conversation info",
    execute: () => {
      if (context.showInfo) {
        context.showInfo();
      }
    },
  },
  {
    name: "export",
    description: "Copy conversation to clipboard",
    execute: () => {
      if (context.exportConversation) {
        context.exportConversation();
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
