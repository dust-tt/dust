import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useWorkspaceLocale } from "@app/hooks/useWorkspaceLocale";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { LOCALE_LABELS, SUPPORTED_LOCALES } from "@app/types/locale";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

const WORKSPACE_LOCALE_LABEL = "Language";
const WORKSPACE_LOCALE_DESCRIPTION =
  "The default language of Dust for members who have not chosen their own";

interface WorkspaceLocalePickerProps {
  owner: WorkspaceType;
}

export function WorkspaceLocalePicker({ owner }: WorkspaceLocalePickerProps) {
  const { hasFeature } = useFeatureFlags();

  if (!hasFeature("localisation")) {
    return null;
  }

  return <WorkspaceLocaleRow owner={owner} />;
}

function WorkspaceLocaleRow({ owner }: WorkspaceLocalePickerProps) {
  const { workspaceLocale, isChanging, doUpdateWorkspaceLocale } =
    useWorkspaceLocale({ owner });

  return (
    <GovernanceSettingRowLayout
      label={WORKSPACE_LOCALE_LABEL}
      description={WORKSPACE_LOCALE_DESCRIPTION}
      action={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              isSelect
              label={LOCALE_LABELS[workspaceLocale]}
              disabled={isChanging}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={workspaceLocale}>
              {SUPPORTED_LOCALES.map((locale) => (
                <DropdownMenuRadioItem
                  key={locale}
                  value={locale}
                  label={LOCALE_LABELS[locale]}
                  onClick={() => void doUpdateWorkspaceLocale(locale)}
                />
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );
}
