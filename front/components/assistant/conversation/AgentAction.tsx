import type { AgentActionType } from "@dust-tt/types";
import {
  assertNever,
  isDustAppRunActionType,
  isProcessActionType,
  isRetrievalActionType,
  isTablesQueryActionType,
  isWebsearchActionType,
} from "@dust-tt/types";

import DustAppRunAction from "@app/components/assistant/conversation/DustAppRunAction";
import ProcessAction from "@app/components/assistant/conversation/ProcessAction";
import RetrievalAction from "@app/components/assistant/conversation/RetrievalAction";
import TablesQueryAction from "@app/components/assistant/conversation/TablesQueryAction";
import WebsearchAction from "@app/components/assistant/conversation/WebsearchAction";

export function AgentAction({ action }: { action: AgentActionType }) {
  if (isRetrievalActionType(action)) {
    return (
      <div className="pb-4">
        <RetrievalAction retrievalAction={action} />
      </div>
    );
  } else if (isDustAppRunActionType(action)) {
    return (
      <div className="pb-4">
        <DustAppRunAction dustAppRunAction={action} />
      </div>
    );
  } else if (isTablesQueryActionType(action)) {
    return (
      <div className="pb-4">
        <TablesQueryAction tablesQueryAction={action} />
      </div>
    );
  } else if (isProcessActionType(action)) {
    return (
      <div className="pb-4">
        <ProcessAction processAction={action} />
      </div>
    );
  } else if (isWebsearchActionType(action)) {
    return (
      <div className="pb-4">
        <WebsearchAction websearchAction={action} />
      </div>
    );
  } else {
    assertNever(action);
  }
}
