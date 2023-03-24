import Link from "next/link";
import clsx from "clsx";

function ArrowIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m11.5 6.5 3 3.5m0 0-3 3.5m3-3.5h-9"
      />
    </svg>
  );
}

const variantStyles = {
  primary:
    "rounded-md bg-zinc-900 py-1 px-3 text-white hover:bg-zinc-700 dark:bg-violet-400/10 dark:text-violet-400 dark:ring-1 dark:ring-inset dark:ring-violet-400/20 dark:hover:bg-violet-400/10 dark:hover:text-violet-300 dark:hover:ring-violet-300",
  secondary:
    "rounded-md bg-zinc-100 py-1 px-3 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800/40 dark:text-zinc-400 dark:ring-1 dark:ring-inset dark:ring-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-300",
  filled:
    "rounded-md bg-zinc-900 py-1 px-3 text-white hover:bg-zinc-700 dark:bg-violet-500 dark:text-white dark:hover:bg-violet-400",
  outline:
    "rounded-md py-1 px-3 text-zinc-700 ring-1 ring-inset ring-zinc-900/10 hover:bg-zinc-900/2.5 hover:text-zinc-900 dark:text-zinc-400 dark:ring-white/10 dark:hover:bg-white/5 dark:hover:text-white",
  text: "text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-500",
};

export function Button({
  variant = "primary",
  className,
  children,
  arrow,
  ...props
}) {
  let Component = props.href ? Link : "button";

  className = clsx(
    "inline-flex gap-0.5 justify-center overflow-hidden text-sm font-medium transition",
    variantStyles[variant],
    className
  );

  let arrowIcon = (
    <ArrowIcon
      className={clsx(
        "mt-0.5 h-5 w-5",
        variant === "text" && "relative top-px",
        arrow === "left" && "-ml-1 rotate-180",
        arrow === "right" && "-mr-1"
      )}
    />
  );

  return (
    <Component className={className} {...props}>
      {arrow === "left" && arrowIcon}
      {children}
      {arrow === "right" && arrowIcon}
    </Component>
  );
}
