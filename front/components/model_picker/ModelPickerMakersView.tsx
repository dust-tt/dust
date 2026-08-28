import type {
  MakerGroup,
  Selection,
} from "@app/components/model_picker/modelPickerUtils";
import { getModelMakerLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  getModelMaker,
  getModelMakerDisplayName,
} from "@app/types/assistant/models/providers";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  DropdownMenuItem,
  Icon,
} from "@dust-tt/sparkle";

interface ModelPickerMakersViewProps {
  makerGroups: MakerGroup[];
  shown: Selection;
  onBack: () => void;
  onSelectMaker: (makerId: ModelMakerIdType) => void;
}

export function ModelPickerMakersView({
  makerGroups,
  shown,
  onBack,
  onSelectMaker,
}: ModelPickerMakersViewProps) {
  const { isDark } = useTheme();

  const selectedModelMaker =
    shown.display.kind === "model" ? getModelMaker(shown.display.model) : null;

  return (
    <>
      <DropdownMenuItem
        icon={ArrowLeft}
        label="More models"
        truncateText
        onClick={onBack}
        onSelect={(e) => e.preventDefault()}
      />
      {makerGroups.map((maker) => (
        <DropdownMenuItem
          key={maker.makerId}
          label={getModelMakerDisplayName(maker.makerId)}
          icon={getModelMakerLogo(maker.makerId, isDark)}
          endComponent={
            <div className="flex items-center gap-1">
              {selectedModelMaker === maker.makerId && (
                <Icon
                  visual={Check}
                  size="sm"
                  className="text-muted-foreground"
                />
              )}
              <Icon
                visual={ChevronRight}
                size="xs"
                className="text-muted-foreground"
              />
            </div>
          }
          onClick={() => onSelectMaker(maker.makerId)}
          onSelect={(e) => e.preventDefault()}
        />
      ))}
    </>
  );
}
