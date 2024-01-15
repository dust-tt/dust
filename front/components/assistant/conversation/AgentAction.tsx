import type { AgentActionType } from "@dust-tt/types";
import {
  isDustAppRunActionType,
  isRetrievalActionType,
  isTablesQueryActionType,
} from "@dust-tt/types";

import DustAppRunAction from "@app/components/assistant/conversation/DustAppRunAction";
import RetrievalAction from "@app/components/assistant/conversation/RetrievalAction";
import TablesQueryAction from "@app/components/assistant/conversation/TablesQueryAction";

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
  if (isTablesQueryActionType(action)) {
    return (
      <div className="pb-4">
        <TablesQueryAction tablesQueryAction={action} />
      </div>
    );
  }
  throw new Error(`Unhandled action ${action}`);
}
