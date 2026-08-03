import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import {
  Button,
  type ButtonVariantType,
  Star01,
  StarFilled,
} from "@dust-tt/sparkle";
import type { MouseEvent } from "react";

type SkillFavoriteButtonProps = {
  isFavorite: boolean;
  onFavoriteChange: (isFavorite: boolean) => void;
  skill: SkillWithoutInstructionsAndToolsType;
  size?: "icon" | "icon-xs";
  variant?: ButtonVariantType;
};

export function SkillFavoriteButton({
  isFavorite,
  onFavoriteChange,
  skill,
  size = "icon",
  variant = "ghost-secondary",
}: SkillFavoriteButtonProps) {
  const nextIsFavorite = !isFavorite;

  return (
    <Button
      size={size}
      variant={variant}
      icon={isFavorite ? StarFilled : Star01}
      tooltip={`${nextIsFavorite ? "Favorite" : "Unfavorite"} ${skill.name}`}
      className={
        isFavorite
          ? "text-warning dark:text-warning-night hover:text-warning dark:hover:text-warning-night"
          : undefined
      }
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onFavoriteChange(nextIsFavorite);
      }}
    />
  );
}
