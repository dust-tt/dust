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
      d="M6.965 10.4V6.498L3.73 9.731A1.034 1.034 0 1 1 2.27 8.27l5-5 .075-.07a1.035 1.035 0 0 1 1.387.07l5 5A1.034 1.034 0 1 1 12.27 9.73L9.035 6.498V10.4c0 1.697 0 2.908.078 3.857.077.936.223 1.526.463 1.997a4.97 4.97 0 0 0 2.17 2.17c.472.24 1.061.386 1.997.463.949.077 2.16.078 3.857.078H21a1.035 1.035 0 0 1 0 2.07h-3.4c-1.663 0-2.973.001-4.025-.085-1.064-.087-1.957-.268-2.768-.681a7.04 7.04 0 0 1-3.076-3.076c-.413-.812-.594-1.704-.681-2.768-.086-1.053-.085-2.362-.085-4.025"
    />
  </svg>
);
export default SvgCornerLeftUp;
