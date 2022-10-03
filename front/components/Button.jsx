import { classNames } from "../lib/utils";

export function Button({ type, onClick, disabled, children }) {
  return (
    <button
      type={type ? type : "button"}
      className={classNames(
        "inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium leading-4",
        disabled ? "text-gray-300" : "hover:bg-gray-50 text-gray-700",
        "shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function ActionButton({ type, onClick, disabled, children }) {
  return (
    <button
      type={type ? type : "button"}
      className={classNames(
        "inline-flex items-center rounded-md border px-3 py-1 text-sm font-medium leading-6",
        disabled ? "bg-white text-gray-300" : "hover:bg-gray-800 bg-gray-700 text-white",
        "shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1"
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}