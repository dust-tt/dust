import {
  isDatabaseQueryActionType,
  isDustAppRunActionType,
} from "@dust-tt/types";
import { isRetrievalActionType } from "@dust-tt/types";
import { AgentActionType } from "@dust-tt/types";

import DatabaseQueryAction from "@app/components/assistant/conversation/DatabaseQueryAction";
import DustAppRunAction from "@app/components/assistant/conversation/DustAppRunAction";
import RetrievalAction from "@app/components/assistant/conversation/RetrievalAction";

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
        <DustAppRunAction dustAppRunAction={action} />
      </div>
    );
  }
  if (isDatabaseQueryActionType(action)) {
    return (
      <div className="pb-4">
        <DatabaseQueryAction databaseQueryAction={action} />
      </div>
    );
  }
  throw new Error(`Unhandled action ${action}`);
}
