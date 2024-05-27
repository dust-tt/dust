import type { WebsearchActionType } from "@dust-tt/types";

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
