import { isDustAppRunActionType } from "@app/types/assistant/actions/dust_app_run";
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
  if (isDustAppRunActionType(action)) {
    return (
      <div className="pb-4">
        <span className="text-red">TODO(spolu) DUST APP RUN ACTION</span>
      </div>
    );
  }
  throw new Error(`Unhandled action ${action}`);
}
