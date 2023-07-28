import { classNames } from "@app/lib/utils";

export function Button({
  type = "button",
  onClick = null,
  disabled = false,
  children,
}: React.PropsWithChildren<{
  type?: "button" | "submit" | "reset" | undefined;
  onClick?: any;
  disabled?: boolean;
}>) {
  return (
    <button
      type={type ? type : "button"}
      className={classNames(
        "inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium leading-4",
        disabled ? "text-gray-300" : "text-gray-700 hover:bg-gray-50",
        "shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function ActionButton({
  type = "button",
  onClick = null,
  onMouseDown = null,
  disabled = false,
  children,
}: React.PropsWithChildren<{
  type?: "button" | "submit" | "reset" | undefined;
  onClick?: any;
  onMouseDown?: any; // useful when you don't want to end selection
  disabled?: boolean;
}>) {
  return (
    <button
      type={type ? type : "button"}
      className={classNames(
        "inline-flex items-center rounded-md border px-3 py-1 text-sm font-medium leading-6",
        disabled
          ? "border-gray-200 bg-white text-gray-300"
          : "border-gray-700 bg-gray-700 text-white hover:bg-gray-800",
        "shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
      )}
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function HighlightButton({
  type,
  onClick,
  disabled,
  children,
}: React.PropsWithChildren<{
  type?: "button" | "submit" | "reset" | undefined;
  onClick?: any;
  disabled?: boolean;
}>) {
  return (
    <button
      type={type ? type : "button"}
      className={classNames(
        "inline-flex items-center rounded-md border px-3 py-1 text-sm font-medium leading-6",
        disabled
          ? "border-gray-200 bg-white text-gray-300"
          : "border-action-600 bg-action-600 text-white hover:bg-action-500",
        "shadow-sm focus:outline-none focus:ring-2 focus:ring-action-500 focus:ring-offset-2"
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

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
