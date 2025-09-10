export interface MockAgentType {
  id: string;
  name: string;
  description: string;
  status: "active" | "draft" | "archived";
  avatar?: string;
  model: string;
}

export interface MockConversationBubble {
  id: string;
  agentId: string;
  message: string;
  timestamp: Date;
  isUserMessage: boolean;
}

export interface CanvasItem {
  id: string;
  type: "agent" | "conversation" | "note";
  x: number;
  y: number;
  data: MockAgentType | MockConversationBubble | { content: string };
}

export const mockAgents: MockAgentType[] = [
  {
    id: "agent-1",
    name: "Research Assistant",
    description: "Helps with research and data analysis",
    status: "active",
    model: "gpt-4",
  },
  {
    id: "agent-2", 
    name: "Code Reviewer",
    description: "Reviews code and suggests improvements",
    status: "active",
    model: "claude-3",
  },
  {
    id: "agent-3",
    name: "Creative Writer",
    description: "Generates creative content and stories",
    status: "draft",
    model: "gpt-4",
  },
  {
    id: "agent-4",
    name: "Data Analyst",
    description: "Analyzes data and creates visualizations",
    status: "active",
    model: "claude-3",
  }
];

export const mockConversationBubbles: MockConversationBubble[] = [
  {
    id: "msg-1",
    agentId: "agent-1",
    message: "Hello! I'm ready to help with your research.",
    timestamp: new Date(),
    isUserMessage: false,
  },
  {
    id: "msg-2", 
    agentId: "agent-1",
    message: "Can you help me analyze this dataset?",
    timestamp: new Date(),
    isUserMessage: true,
  }
];

// Helper function to create canvas items
export function createCanvasItem(
  type: CanvasItem["type"],
  data: CanvasItem["data"],
  position: { x: number; y: number }
): CanvasItem {
  return {
    id: `${type}-${Date.now()}-${Math.random()}`,
    type,
    x: position.x,
    y: position.y,
    data,
  };
}