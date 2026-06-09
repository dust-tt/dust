import { LinkWrapper } from "@marketing/lib/platform";
import { DustLogo } from "@dust-tt/sparkle";

interface PublicWebsiteLogoProps {
  size?: "default" | "small";
  utmParam?: string;
  baseUrl?: string;
}

const LOGO_CLASS_NAMES = {
  default: "h-[24px] w-[96px]",
  small: "h-[20px] w-[80px]",
} as const;

export const PublicWebsiteLogo = ({
  size = "default",
  utmParam,
  baseUrl,
}: PublicWebsiteLogoProps) => {
  const href = `${baseUrl ?? ""}/home${utmParam ? `?${utmParam}` : ""}`;

  return (
    <LinkWrapper href={href}>
      <DustLogo className={LOGO_CLASS_NAMES[size]} />
    </LinkWrapper>
  );
};
