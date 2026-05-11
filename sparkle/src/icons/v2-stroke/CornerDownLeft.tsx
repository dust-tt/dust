import type { SVGProps } from "react";
import * as React from "react";

const SvgCornerDownLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="M18.965 5.4V4a1.035 1.035 0 0 1 2.07 0v1.4c0 1.663.001 2.973-.085 4.025-.087 1.064-.268 1.957-.681 2.768a7.04 7.04 0 0 1-3.076 3.076c-.811.413-1.704.594-2.768.681-1.053.086-2.362.085-4.025.085H6.498l3.233 3.234A1.034 1.034 0 1 1 8.27 20.73l-5-5a1.034 1.034 0 0 1 0-1.462l5-5A1.034 1.034 0 1 1 9.73 10.73l-3.233 3.234H10.4c1.697 0 2.908 0 3.857-.078.936-.077 1.526-.223 1.997-.463a4.97 4.97 0 0 0 2.17-2.17c.24-.471.386-1.06.463-1.997.077-.949.078-2.16.078-3.857"
    />
  </svg>
);
export default SvgCornerDownLeft;
