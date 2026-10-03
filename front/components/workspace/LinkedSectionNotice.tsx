import { Hoverable, Page } from "@dust-tt/sparkle";
import type { ReactNode } from "react";

type LinkedSectionNoticeProps =
  | {
      description: string;
      linkLabel: string;
      onLinkClick: () => void;
      children?: undefined;
    }
  | {
      children: ReactNode;
      description?: undefined;
      linkLabel?: undefined;
      onLinkClick?: undefined;
    };

export function LinkedSectionNotice(props: LinkedSectionNoticeProps) {
  return (
    <div className="w-full rounded-xl bg-muted-background px-4 py-3">
      <Page.P variant="secondary" size="sm">
        {props.description === undefined ? (
          props.children
        ) : (
          <>
            {props.description}{" "}
            <Hoverable variant="primary" onClick={props.onLinkClick}>
              {props.linkLabel}
            </Hoverable>
          </>
        )}
      </Page.P>
    </div>
  );
}
