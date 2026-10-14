import type { TrackingExtra } from "@app/lib/tracking";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";

// PostHog event for every place a Frame gets opened. `trackEvent` names it `frames:frame:open`.

// Who opened it: the agent publishing it, the page showing it on load, or the user clicking.
export type FrameOpenSource = "agent" | "auto" | "user";

// What on screen opened it.
export type FrameOpenUiElement =
  // Conversation side panel opening on its own when the agent creates or edits a Frame.
  | "side_panel_auto_open"
  // Frame card listed under the agent's reply.
  | "message_frame_card"
  // Frame chip in a conversation: inline in a reply, a message attachment, a tool output.
  | "file_citation"
  // Frame listed in the conversation's "Files" side panel.
  | "conversation_files_panel"
  // Conversation URL loaded with the Frame panel already open (reload, pasted link, back/forward).
  | "page_url"
  // Frame pinned as the Pod banner, on the Pod's Conversations tab.
  | "pod_pinned_banner"
  // Frame opened from the Pod's file explorer.
  | "pod_files"
  // Public share link.
  | "shared_link";

export type FrameOpenLocation =
  | { type: "conversation"; id: string }
  | { type: "pod"; id: string }
  | { type: "public_share" };

export interface FrameOpenOrigin {
  source: FrameOpenSource;
  uiElement: FrameOpenUiElement;
}

/**
 * @cc [owner:theogz,label:product] frame-open-event-names-frame-and-location
 * `frames:frame:open` MUST carry the Frame's file sId (`frame_id`), how and where it was opened
 * (`source`, `ui_element`, `location_resource_type`) and, outside a public share, the sId of the
 * conversation or Pod it was opened in (`location_resource_id`). Callers MUST fire it once per Frame
 * shown: refreshing or republishing a Frame already on screen is not an open.
 */
export function trackFrameOpen({
  frameId,
  origin,
  location,
  extra,
}: {
  frameId: string;
  origin: FrameOpenOrigin;
  location: FrameOpenLocation;
  extra?: TrackingExtra;
}): void {
  trackEvent({
    area: TRACKING_AREAS.FRAMES,
    object: "frame",
    action: TRACKING_ACTIONS.OPEN,
    extra: {
      ...extra,
      frame_id: frameId,
      source: origin.source,
      ui_element: origin.uiElement,
      location_resource_type: location.type,
      ...(location.type === "public_share"
        ? {}
        : { location_resource_id: location.id }),
    },
  });
}
