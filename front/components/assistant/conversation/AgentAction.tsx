import { isRetrievalActionType } from "@app/types/assistant/actions/retrieval";
import { AgentActionType } from "@app/types/assistant/conversation";

import RetrievalAction from "./RetrievalAction";

export function AgentAction({ action }: { action: AgentActionType }) {
  if (isRetrievalActionType(action)) {
    return <RetrievalAction retrievalAction={action} />;
  }
  throw new Error(`Unhandled action ${action}`);
}
