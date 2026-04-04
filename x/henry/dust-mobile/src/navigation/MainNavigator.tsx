import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ConversationListScreen } from "../screens/ConversationListScreen";
import { ConversationScreen } from "../screens/ConversationScreen";
import type { MainStackParamList } from "./types";

const Stack = createNativeStackNavigator<MainStackParamList>();

export function MainNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ConversationList"
        component={ConversationListScreen}
        options={{ title: "Conversations" }}
      />
      <Stack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={{ title: "" }}
      />
    </Stack.Navigator>
  );
}
