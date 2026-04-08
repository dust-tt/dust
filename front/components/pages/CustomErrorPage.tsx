import { LinkWrapper } from "@app/lib/platform";
import { Button, ExclamationCircleIcon, Icon } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface CustomErrorPageProps {
  title: string;
  description: string;
  href: string;
  label: string;
  icon: ComponentType;
}

// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function CustomErrorPage({
  title,
  description,
  href,
  label,
  icon,
}: CustomErrorPageProps) {
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="flex flex-col gap-3 text-center">
        <div className="flex flex-col items-center">
          <div>
            <Icon
              visual={ExclamationCircleIcon}
              size="lg"
              className="dark:text-golder-400-night text-golden-400"
            />
          </div>
          <p className="heading-xl leading-7 text-foreground dark:text-foreground-night">
            {title}
          </p>
          <p className="copy-sm leading-tight text-muted-foreground dark:text-muted-foreground-night">
            {description}
          </p>
        </div>
        <LinkWrapper href={href}>
          <Button variant="outline" label={label} icon={icon} />
        </LinkWrapper>
      </div>
    </div>
  );
}
