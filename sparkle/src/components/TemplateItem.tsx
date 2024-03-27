import React from "react";
import type { UrlObject } from "url";

import { Avatar, CardButton } from "@sparkle/_index";

interface TemplateItemProps {
  description: string;
  href: string | UrlObject;
  id: string;
  name: string;
  visual: {
    backgroundColor: string;
    emoji: string;
  };
}

export function TemplateItem({
  description,
  href,
  name,
  visual,
}: TemplateItemProps) {
  const { backgroundColor, emoji } = visual;

  return (
    <CardButton
      className="s-flex s-max-h-32 s-max-w-lg s-flex-row s-gap-5 s-p-4"
      href={href}
      variant="tertiary"
      replace
      shallow
    >
      <Avatar
        emoji={emoji}
        size="lg"
        isRounded
        backgroundColor={backgroundColor}
      />
      <div className="s-flex s-flex-col s-gap-2">
        <span className="s-text-bold s-text-lg s-font-medium s-text-element-900">
          {name}
        </span>
        <p className="s-line-clamp-2 s-w-full s-text-base s-font-normal s-text-element-800">
          {description}
        </p>
      </div>
    </CardButton>
  );
}
