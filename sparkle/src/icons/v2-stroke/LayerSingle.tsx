import type { SVGProps } from "react";
import * as React from "react";

const SvgLayerSingle = (props: SVGProps<SVGSVGElement>) => (
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
      d="m12.142 6.03.141.02.176.046c.167.055.303.128.361.157l9.643 4.822a1.035 1.035 0 0 1 0 1.851l-9.643 4.82c-.077.04-.292.158-.537.204-.187.035-.38.035-.566 0-.245-.046-.46-.165-.537-.203l-9.643-4.82a1.036 1.036 0 0 1 0-1.852l9.643-4.822c.077-.038.292-.157.537-.203l.141-.02q.143-.012.284 0M4.314 12 12 15.842 19.685 12 12 8.159z"
    />
  </svg>
);
export default SvgLayerSingle;
