import type { SkillWithoutInstructionsAndToolsType } from "@app/types/assistant/skill_configuration";
import { Button, Star01, StarFilled } from "@dust-tt/sparkle";
import type { MouseEvent } from "react";

type SkillFavoriteButtonProps = {
  isFavorite: boolean;
  onFavoriteChange: (isFavorite: boolean) => void;
  skill: Pick<SkillWithoutInstructionsAndToolsType, "name">;
  size?: "icon" | "icon-xs";
};

export function SkillFavoriteButton({
  isFavorite,
  onFavoriteChange,
  skill,
  size = "icon",
}: SkillFavoriteButtonProps) {
  const nextIsFavorite = !isFavorite;

  return (
    <Button
      size={size}
      variant="ghost-secondary"
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
