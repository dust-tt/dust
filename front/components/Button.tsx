import {
  Button,
  DropdownMenu,
  GithubLogo,
  GoogleLogo,
  Icon,
  LoginIcon,
  Modal,
  RocketIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

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
  const [showModal, setShowModal] = useState<boolean>(false);

  return (
    <>
      <div className={buttonClassname}>
        <Button
          variant={buttonVariant}
          size={buttonSize}
          label={buttonLabel}
          icon={buttonIcon}
          onClick={() => setShowModal(!showModal)}
        />
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        hasChanged={false}
        title="Start with Dust"
        variant="side-sm"
      >
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-16 px-2">
            <div>
              <Button
                variant="tertiary"
                size="md"
                label="Sign up with Google"
                icon={GoogleLogo}
                onClick={onClickGoogle}
              />
            </div>

            <p className="text-center text-lg">
              By signing up, you accept
              <br />
              Dust's{" "}
              <a
                href="/terms"
                className="cursor-pointer font-semibold text-action-400 transition-all duration-300 ease-out hover:text-action-400 hover:underline hover:underline-offset-4 active:text-action-600"
              >
                terms and conditions
              </a>
              .
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
