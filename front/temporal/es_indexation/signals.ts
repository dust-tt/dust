import { defineSignal } from "@temporalio/workflow";

export const indexUserSearchSignal = defineSignal<[void]>(
  "index_user_search_signal"
);

export const indexSkillSearchSignal = defineSignal<[void]>(
  "index_skill_search_signal"
);

export const indexConversationEsSignal = defineSignal<[void]>(
  "index_conversation_es_signal"
);
