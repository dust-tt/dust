export function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

type Breakpoint = "sm" | "md" | "lg" | "xl" | "2xl";

export type Responsive<T extends string> = `${T} ${Breakpoint}:${T}`;

export const responsiveProp = <T extends string>(
  prop: T | Responsive<T>,
  map: Record<T, string>
) => {
  const props = prop.split(" ");
  const classes = props.map((p) => {
    const [breakpoint, value] = p.split(":");
    if (value) {
      // If there's a value after the colon, it means we have a breakpoint prefix.
      return `${breakpoint}:${map[value as T]}`;
    } else {
      // Otherwise, there's no prefix and we just return the mapped class.
      return map[p as T];
    }
  });
  return classes.join(" ");
};
