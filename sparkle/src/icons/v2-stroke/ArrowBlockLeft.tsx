import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowBlockLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="m4.463 12 4.502 4.502V15c0-.572.463-1.035 1.035-1.035h9.965v-3.93H10A1.035 1.035 0 0 1 8.965 9V7.498zm17.572 2.2c0 .123 0 .277-.01.412a1.5 1.5 0 0 1-.157.585 1.54 1.54 0 0 1-.67.671 1.5 1.5 0 0 1-.586.156c-.135.011-.289.011-.412.011h-9.165V19a1.035 1.035 0 0 1-1.766.732l-7-7a1.034 1.034 0 0 1 0-1.463l7-7A1.035 1.035 0 0 1 11.035 5v2.965H20.2c.123 0 .277 0 .412.01.111.01.259.03.42.087l.165.07.106.06c.206.126.38.3.506.505l.06.106.07.165c.057.161.076.31.085.42.011.135.011.289.011.412z"
    />
  </svg>
);
export default SvgArrowBlockLeft;
