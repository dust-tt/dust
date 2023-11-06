import {
  Button,
  DropdownMenu,
  GithubLogo,
  GoogleLogo,
  Icon,
  LoginIcon,
  RocketIcon,
} from "@dust-tt/sparkle";

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
      size="md"
    ></Button>
  );
}

export function SignInDropDownButton({
  buttonVariant = "tertiary",
  buttonLabel = "Sign in",
  buttonIcon = LoginIcon,
  buttonClassname = "",
  shouldDisplayGithub,
  onClickGithub,
  onClickGoogle,
}: {
  buttonVariant?: "primary" | "secondary" | "tertiary";
  buttonLabel?: string;
  buttonIcon?: typeof Icon;
  buttonClassname?: string;
  shouldDisplayGithub: boolean;
  onClickGithub: () => void;
  onClickGoogle: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <Button
          variant={buttonVariant}
          className={buttonClassname}
          size="sm"
          label={buttonLabel}
          icon={buttonIcon}
        />
      </DropdownMenu.Button>
      <DropdownMenu.Items origin="topRight" width={240}>
        <div className="flex flex-col gap-2 p-4">
          <Button
            variant="tertiary"
            size="md"
            label="With Google"
            icon={GoogleLogo}
            onClick={onClickGoogle}
          />
          {shouldDisplayGithub && (
            <Button
              variant="tertiary"
              size="md"
              label="With GitHub"
              icon={GithubLogo}
              onClick={onClickGithub}
            />
          )}
        </div>
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}

export function SignUpDropDownButton({
  buttonVariant = "primary",
  buttonLabel = "Start with Dust",
  buttonSize = "sm",
  buttonIcon = RocketIcon,
  buttonClassname = "",
  onClickGoogle,
}: {
  buttonVariant?: "primary" | "secondary" | "tertiary";
  buttonLabel?: string;
  buttonSize?: "sm" | "md" | "lg";
  buttonIcon?: typeof Icon;
  buttonClassname?: string;
  onClickGoogle: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <Button
          variant={buttonVariant}
          className={buttonClassname}
          size={buttonSize}
          label={buttonLabel}
          icon={buttonIcon}
        />
      </DropdownMenu.Button>
      <DropdownMenu.Items origin="topRight" width={260}>
        <div className="flex flex-col gap-2 p-4">
          <Button
            variant="tertiary"
            size="md"
            label="Sign up with Google"
            icon={GoogleLogo}
            onClick={onClickGoogle}
          />
        </div>
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
