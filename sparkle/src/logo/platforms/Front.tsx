import type { SVGProps } from "react";
import * as React from "react";
const SvgFront = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 24 24"
    {...props}
  >
    <g transform="translate(2, 0) scale(0.85)">
      <path d="M0 23.544H7.915V7.881H23.69V0H0V23.544Z" fill="#A857F1" />
      <path
        d="M16.866 24C20.822 24 24.03 20.792 24.03 16.836C24.03 12.88 20.822 9.672 16.866 9.672C12.91 9.672 9.702 12.88 9.702 16.836C9.702 20.792 12.91 24 16.866 24Z"
        fill="#A857F1"
      />
    </g>
  </svg>
);
export default SvgFront;
