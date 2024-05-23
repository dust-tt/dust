import type { WebsearchActionType } from "@dust-tt/types/dist/front/assistant/actions/websearch";

// TODO(pr,websearch) Implement this function
export default function WebsearchAction({
  websearchAction,
}: {
  websearchAction: WebsearchActionType;
}) {
  return (
    <>
      <div>
        Action to be implemented here: {JSON.stringify(websearchAction)}
      </div>
    </>
  );
}
