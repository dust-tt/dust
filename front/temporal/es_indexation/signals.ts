import { defineSignal } from "@temporalio/workflow";

export const indexUserSearchSignal = defineSignal<[void]>(
  "index_user_search_signal"
);

export const indexConversationEsSignal = defineSignal<[void]>(
  "index_conversation_es_signal"
);
