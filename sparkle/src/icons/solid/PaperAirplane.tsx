import type { SVGProps } from "react";
import * as React from "react";
const SvgPaperAirplane = (props: SVGProps<SVGSVGElement>) => (
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
      d="M1.946 9.316c-.522-.175-.526-.456.011-.635L21.043 2.32c.529-.176.832.12.684.638l-5.453 19.086c-.151.529-.456.547-.68.045L12 14l6-8-8 6-8.054-2.684Z"
    />
  </svg>
);
export default SvgPaperAirplane;
