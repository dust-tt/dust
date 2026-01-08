export interface User {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  portrait?: string;
}

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  backgroundColor: string;
  description: string;
}

export interface Message {
  id: string;
  content: string;
  timestamp: Date;
  ownerId: string; // user ID or agent ID
  ownerType: "user" | "agent";
  type: "user" | "agent"; // for ConversationMessage component
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  userParticipants: string[];
  agentParticipants: string[];
  messages?: Message[];
  description?: string;
  spaceId?: string;
}

export interface Space {
  id: string;
  name: string;
  description: string;
}
