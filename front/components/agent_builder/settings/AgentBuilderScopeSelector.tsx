import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EyeIcon,
  EyeSlashIcon,
} from "@dust-tt/sparkle";
import { useController } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";

export function AgentBuilderScopeSelector() {
  const { field } = useController<AgentBuilderFormData, "agentSettings.scope">({
    name: "agentSettings.scope",
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={field.value === "hidden" ? EyeSlashIcon : EyeIcon}
          variant="outline"
          isSelect
          size="sm"
          label={field.value === "hidden" ? "Unpublished" : "Published"}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[300px]" side="bottom">
        <DropdownMenuItem
          icon={EyeSlashIcon}
          label="Unpublished"
          description="Visible and usable by editors only"
          onClick={() => field.onChange("hidden")}
        />
        <DropdownMenuItem
          icon={EyeIcon}
          label="Published"
          description="Visible and usable by all members of the workspace"
          onClick={() => field.onChange("visible")}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
