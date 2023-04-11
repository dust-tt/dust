import { classNames } from "@app/lib/utils";

export function Button({
  type = null,
  onClick = null,
  disabled = false,
  children,
}) {
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
  type = null,
  onClick,
  disabled = false,
  children,
}) {
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
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function HighlightButton({ type, onClick, disabled, children }) {
  return (
    <button
      type={type ? type : "button"}
      className={classNames(
        "inline-flex items-center rounded-md border px-3 py-1 text-sm font-medium leading-6",
        disabled
          ? "border-gray-200 bg-white text-gray-300"
          : "border-violet-600 bg-violet-600 text-white hover:bg-violet-500",
        "shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
