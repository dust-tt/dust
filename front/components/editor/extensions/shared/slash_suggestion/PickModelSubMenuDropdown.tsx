import { buildPickModelSlashCommandItems } from "@app/components/editor/extensions/shared/slash_suggestion/buildPickModelSlashCommandItems";
import { isSelectModelSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/pickModelSlashCommand";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import type { SlashMenuStackFrame } from "@app/components/editor/extensions/shared/slash_suggestion/slashMenuNavigation";
import type { Selection } from "@app/components/model_picker/modelPickerUtils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useModels } from "@app/lib/swr/models";
import type { EnabledModelConfigurationType } from "@app/types/api/assistant/models";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type { LightWorkspaceType } from "@app/types/user";
import type { SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";

interface PickModelSubMenuDropdownProps
  extends Pick<
    SuggestionProps<SlashCommand>,
    "clientRect" | "editor" | "query" | "range"
  > {
  activeFrame: SlashMenuStackFrame;
  onBack: () => void;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
  owner: LightWorkspaceType;
}

interface PickModelSubMenuDropdownRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const PickModelSubMenuDropdown = forwardRef<
  PickModelSubMenuDropdownRef,
  PickModelSubMenuDropdownProps
>(
  (
    { activeFrame, clientRect, onBack, onClose, onSelect, owner, query },
    ref
  ) => {
    const dropdownRef = useRef<{
      onKeyDown: (props: { event: KeyboardEvent }) => boolean;
    }>(null);
    const { isDark } = useTheme();

    const { models, streams, isModelsLoading } = useModels({ owner });

    const getModelIcon = useMemo(() => {
      return (model: EnabledModelConfigurationType) =>
        getModelMakerLogo(getModelMaker(model), isDark);
    }, [isDark]);

    const items = useMemo(
      () =>
        buildPickModelSlashCommandItems({
          getModelIcon,
          models,
          query,
          streams,
        }),
      [getModelIcon, models, query, streams]
    );

    const handleSelect = (item: SlashCommand) => {
      if (isSelectModelSlashCommand(item)) {
        onSelect(item.data.selection);
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (event.key === "Backspace" && query.trim().length === 0) {
            event.preventDefault();
            onClose();
            return true;
          }

          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [onClose, query]
    );

    return (
      <SlashCommandDropdown
        ref={dropdownRef}
        clientRect={clientRect}
        command={handleSelect}
        emptyMessage="No models found"
        isLoading={isModelsLoading}
        loadingMessage="Loading models…"
        items={items}
        subMenuNavigation={{
          label: activeFrame.command.label,
          onBack,
        }}
        size="wide"
      />
    );
  }
);

PickModelSubMenuDropdown.displayName = "PickModelSubMenuDropdown";
