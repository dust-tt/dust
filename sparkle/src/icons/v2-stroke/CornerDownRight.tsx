import type { SVGProps } from "react";
import * as React from "react";

const SvgCornerDownRight = (props: SVGProps<SVGSVGElement>) => (
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
      d="M2.965 5.4V4a1.035 1.035 0 0 1 2.07 0v1.4c0 1.697 0 2.908.078 3.857.077.936.223 1.526.463 1.997a4.97 4.97 0 0 0 2.17 2.17c.472.24 1.06.386 1.997.463.949.077 2.16.078 3.857.078h3.902l-3.233-3.234A1.034 1.034 0 1 1 15.73 9.27l5 5a1.034 1.034 0 0 1 0 1.462l-5 5a1.034 1.034 0 1 1-1.462-1.462l3.233-3.234H13.6c-1.663 0-2.972.001-4.025-.085-1.064-.087-1.957-.268-2.768-.681a7.04 7.04 0 0 1-3.076-3.076c-.413-.811-.594-1.704-.681-2.768-.086-1.053-.085-2.362-.085-4.025"
    />
  </svg>
);
export default SvgCornerDownRight;
