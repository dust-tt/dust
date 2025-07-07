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
          icon={EyeSlashIcon}
          className="text-muted-foreground dark:text-muted-foreground-night"
          variant="outline"
          isSelect
          size="sm"
          label={field.value === "hidden" ? "Unpublished" : "Published"}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[300px]" align="end" side="bottom">
        <DropdownMenuItem
          icon={EyeSlashIcon}
          label="Unpublished"
          onClick={() => field.onChange("hidden")}
        />
        <DropdownMenuItem
          icon={EyeIcon}
          label="Published"
          onClick={() => field.onChange("public")}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
