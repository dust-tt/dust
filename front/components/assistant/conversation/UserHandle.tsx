import Link from "next/link";
import { useRouter } from "next/router";

interface UserHandleProps {
  user: {
    sId: string;
    name: string | null;
  };
}

export function UserHandle({ user }: UserHandleProps) {
  const router = useRouter();

  const href = {
    pathname: router.pathname,
    query: { ...router.query, userDetails: user.sId },
  };

  if (!user.name) {
    return <span>Unknown User</span>;
  }

  return (
    <Link
      href={href}
      shallow
      className="max-w-[14rem] cursor-pointer truncate transition duration-200 hover:text-highlight active:text-highlight-600 sm:max-w-fit"
    >
      {user.name}
    </Link>
  );
}
