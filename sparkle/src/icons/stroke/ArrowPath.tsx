import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowPath = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 4a8 8 0 0 0-8 8H2C2 6.477 6.477 2 12 2a9.969 9.969 0 0 1 7.071 2.929L21 3v5h-5l1.657-1.657A7.975 7.975 0 0 0 12 4ZM8 16l-1.657 1.657A8 8 0 0 0 20 12h2c0 5.523-4.477 10-10 10a9.969 9.969 0 0 1-7.071-2.929L3 21v-5h5Z"
    />
  </svg>
);
export default SvgArrowPath;
