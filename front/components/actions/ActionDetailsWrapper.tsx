import { Avatar, cn, Icon, Spinner } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface ActionDetailsWrapperProps {
  actionName: string;
  children: React.ReactNode;
  viewType: "conversation" | "sidebar";
  visual: ComponentType<{ className?: string }>;
}

export function ActionDetailsWrapper({
  actionName,
  children,
  viewType,
  visual,
}: ActionDetailsWrapperProps) {
  if (viewType === "conversation") {
    return (
      <div className="flex w-full flex-col gap-y-2 px-2 py-1">{children}</div>
    );
  }

  return <div>{children}</div>;
}
