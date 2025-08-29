import { TurnState } from "@microsoft/teams-ai";

export interface ConversationState {
  count: number;
}
export type ApplicationTurnState = TurnState<ConversationState>;
