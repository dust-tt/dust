import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../src/components/Dropdown";
import { UserIcon } from "@sparkle/icons/app";

export function DropdownExample() {
  return (
    <div className="s-p-4">
      <DropdownMenu>
        <DropdownMenuTrigger>Open Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem label="Test Item" icon={UserIcon} href="/test" />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
