import type { SVGProps } from "react";
import * as React from "react";

const SvgCornerLeftDown = (props: SVGProps<SVGSVGElement>) => (
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
      d="M6.965 13.6c0-1.663-.001-2.972.085-4.025.087-1.064.268-1.957.681-2.768a7.04 7.04 0 0 1 3.076-3.076c.811-.413 1.704-.594 2.768-.681 1.053-.086 2.362-.085 4.025-.085H21a1.035 1.035 0 0 1 0 2.07h-3.4c-1.697 0-2.908 0-3.857.078-.936.077-1.525.223-1.997.463a4.97 4.97 0 0 0-2.17 2.17c-.24.472-.386 1.06-.463 1.997-.077.949-.078 2.16-.078 3.857v3.902l3.234-3.233a1.034 1.034 0 1 1 1.463 1.462l-5 5a1.035 1.035 0 0 1-1.463 0l-5-5A1.034 1.034 0 1 1 3.73 14.27l3.234 3.233z"
    />
  </svg>
);
export default SvgCornerLeftDown;
