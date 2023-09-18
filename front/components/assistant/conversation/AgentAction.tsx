import { isRetrievalActionType } from "@app/types/assistant/actions/retrieval";
import { AgentActionType } from "@app/types/assistant/conversation";

import RetrievalAction from "./RetrievalAction";

export function AgentAction({ action }: { action: AgentActionType }) {
  if (isRetrievalActionType(action)) {
    return (
      <div className="pb-4">
        <RetrievalAction retrievalAction={action} />
      </div>
    );
  }
  throw new Error(`Unhandled action ${action}`);
}
