import * as React from "react";
import type { SVGProps } from "react";
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
      d="m21.726 2.957-5.453 19.086c-.15.529-.475.553-.717.07L11 13 1.923 9.37c-.51-.205-.504-.51.034-.689L21.043 2.32c.528-.176.832.12.683.638Zm-2.69 2.14L6.811 9.17l5.637 2.255 3.04 6.081 3.546-12.41Z"
    />
  </svg>
);
export default SvgPaperAirplane;
