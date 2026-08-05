import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import {
  Button,
  type ButtonVariantType,
  Star01,
  StarFilled,
} from "@dust-tt/sparkle";
import type { MouseEvent } from "react";
import { useState } from "react";

type SkillFavoriteButtonProps = {
  isFavorite: boolean;
  onFavoriteChange: (isFavorite: boolean) => Promise<void>;
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
  const [isUpdating, setIsUpdating] = useState(false);
  const nextIsFavorite = !isFavorite;

  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsUpdating(true);
    try {
      await onFavoriteChange(nextIsFavorite);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Button
      size={size}
      variant={variant}
      icon={isFavorite ? StarFilled : Star01}
      isLoading={isUpdating}
      aria-pressed={isFavorite}
      tooltip={`${nextIsFavorite ? "Favorite" : "Unfavorite"} ${skill.name}`}
      onClick={handleClick}
    />
  );
}
