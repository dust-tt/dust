import type { SVGProps } from "react";
import * as React from "react";
const SvgAnthropic = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#000"
      d="M16.867 4H13.5l6.132 15.53H23L16.867 4ZM7.133 4 1 19.53h3.438l1.237-3.262h6.435l1.251 3.261H16.8L10.653 4h-3.52Zm-.33 9.382 2.09-5.46 2.104 5.46H6.802Z"
    />
  </svg>
);
export default SvgAnthropic;
