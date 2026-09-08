import type { SVGProps } from "react";
import * as React from "react";

const SvgFire = (props: SVGProps<SVGSVGElement>) => (
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
      d="M18.309 13.836c0-2.267-.98-4.401-2.267-6.215-.854-1.205-1.82-2.23-2.65-3.015l-1.889 5.179a1.035 1.035 0 0 1-1.692.388L7.647 8.076c-1.127 1.707-1.955 3.677-1.955 5.76a6.308 6.308 0 0 0 12.617 0m2.07 0a8.378 8.378 0 0 1-16.758 0c0-3.128 1.47-5.89 3.058-7.971a1.035 1.035 0 0 1 1.544-.116l1.883 1.826 1.864-5.109a1.036 1.036 0 0 1 1.634-.442c1.029.854 2.703 2.392 4.127 4.4 1.419 2.001 2.647 4.553 2.647 7.412"
    />
  </svg>
);
export default SvgFire;
