import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type RootStackParamList = {
  Login: undefined;
  WorkspaceSelection: undefined;
  Main: undefined;
};

export type MainStackParamList = {
  ConversationList: undefined;
  Conversation: {
    conversationId?: string;
    agentId?: string;
  };
};

export type LoginScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "Login"
>;

export type WorkspaceSelectionScreenProps = NativeStackScreenProps<
  RootStackParamList,
  "WorkspaceSelection"
>;

export type ConversationListScreenProps = NativeStackScreenProps<
  MainStackParamList,
  "ConversationList"
>;

export type ConversationScreenProps = NativeStackScreenProps<
  MainStackParamList,
  "Conversation"
>;
