import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import { cn } from "@dust-tt/sparkle";

interface DustAvatarIconProps {
  className?: string;
}

// Renders the @dust agent's avatar as an icon so the "auto" model shows the same
// visual as the Dust agent rather than the generic Dust logo.
export function DustAvatarIcon({ className }: DustAvatarIconProps) {
  return (
    <img
      src={DUST_AVATAR_URL}
      alt=""
      className={cn("rounded-full object-cover", className)}
    />
  );
}
