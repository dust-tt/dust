import type { SVGProps } from "react";
import * as React from "react";

const SvgCornerLeftUp = (props: SVGProps<SVGSVGElement>) => (
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
      d="M6.965 10.4V4a1.035 1.035 0 0 1 2.07 0v6.4c0 1.697 0 2.908.078 3.857.077.936.223 1.526.463 1.997a4.97 4.97 0 0 0 2.17 2.17c.471.24 1.06.386 1.997.463.949.077 2.16.078 3.857.078H21a1.035 1.035 0 0 1 0 2.07h-3.4c-1.663 0-2.973.001-4.025-.085-1.064-.087-1.957-.268-2.768-.681a7.04 7.04 0 0 1-3.076-3.076c-.413-.812-.594-1.704-.681-2.768-.086-1.053-.085-2.362-.085-4.025"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M7.347 3.197a1.035 1.035 0 0 1 1.385.072l5 5a1.034 1.034 0 1 1-1.463 1.463L8 5.463 3.732 9.732a1.034 1.034 0 1 1-1.463-1.463l5-5z"
    />
  </svg>
);
export default SvgCornerLeftUp;
