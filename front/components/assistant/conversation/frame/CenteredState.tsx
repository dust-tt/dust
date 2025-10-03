import React from "react";

interface CenteredStateProps {
  children: React.ReactNode;
}

export function CenteredState({ children }: CenteredStateProps) {
  return (
    <div className="flex h-full items-center justify-center gap-2">
      {children}
    </div>
  );
}
