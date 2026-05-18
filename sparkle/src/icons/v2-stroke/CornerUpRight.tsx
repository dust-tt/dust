import type { SVGProps } from "react";
import * as React from "react";

const SvgCornerUpRight = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      d="M2.965 20v-1.4c0-1.663-.001-2.973.085-4.025.087-1.064.268-1.957.681-2.768A7.04 7.04 0 0 1 6.807 8.73c.811-.413 1.704-.594 2.768-.681 1.053-.086 2.362-.085 4.025-.085h3.902L14.269 4.73A1.034 1.034 0 1 1 15.73 3.27l5 5a1.034 1.034 0 0 1 0 1.462l-5 5a1.034 1.034 0 1 1-1.462-1.462l3.233-3.234H13.6c-1.697 0-2.908 0-3.857.078-.936.077-1.525.223-1.997.463a4.97 4.97 0 0 0-2.17 2.17c-.24.472-.386 1.061-.463 1.997-.077.949-.078 2.16-.078 3.857V20a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgCornerUpRight;
