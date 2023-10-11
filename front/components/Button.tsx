import { Button } from "@dust-tt/sparkle";

import { classNames } from "@app/lib/utils";

export function GoogleSignInButton({
  onClick = null,
  children,
}: React.PropsWithChildren<{
  onClick?: any;
}>) {
  return (
    <button
      type="button"
      className={classNames(
        "inline-flex items-center rounded-md border  px-3 py-1 text-sm leading-6 shadow-sm" +
          "font-roboto border-gray-700 bg-white text-gray-800 hover:bg-gray-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-800 focus:ring-offset-2"
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function SignInButton({
  label,
  icon = null,
  onClick = null,
}: React.PropsWithChildren<{
  label: string;
  icon?: any;
  onClick?: any;
}>) {
  return (
    <Button
      label={label}
      variant="tertiary"
      icon={icon}
      onClick={onClick}
    ></Button>
  );
}
