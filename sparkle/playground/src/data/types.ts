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

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  userParticipants: string[];
  agentParticipants: string[];
}

export interface Space {
  id: string;
  name: string;
  description: string;
}

