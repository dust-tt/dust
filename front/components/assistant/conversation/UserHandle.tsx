import { useClientType } from "@app/lib/context/clientType";
import { LinkWrapper, useAppRouter } from "@app/lib/platform";
import { Trans } from "@lingui/react/macro";

interface UserHandleProps {
  user: {
    sId: string;
    name: string | null;
  };
}

export function UserHandle({ user }: UserHandleProps) {
  const router = useAppRouter();
  const clientType = useClientType();

  const href = {
    pathname: router.pathname,
    query: { ...router.query, userDetails: user.sId },
  };

  if (!user.name) {
    return (
      <span>
        <Trans>Unknown user</Trans>
      </span>
    );
  }

  if (clientType === "extension") {
    return <span>{user.name}</span>;
  }

  return (
    <LinkWrapper
      href={href}
      shallow
      className="max-w-[14rem] cursor-pointer truncate transition duration-200 hover:text-highlight active:text-highlight-600 sm:max-w-fit"
    >
      {user.name}
    </LinkWrapper>
  );
}
