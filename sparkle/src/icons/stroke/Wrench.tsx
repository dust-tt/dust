import * as React from "react";
import type { SVGProps } from "react";
const SvgWrench = (props: SVGProps<SVGSVGElement>) => (
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
      d="M5.329 3.272a3.5 3.5 0 0 1 4.255 4.962l10.709 10.71-1.415 1.414L8.17 9.648a3.502 3.502 0 0 1-4.962-4.255L5.443 7.63a1.5 1.5 0 0 0 2.122-2.121L5.329 3.272Zm10.367 1.883 3.182-1.768 1.415 1.415-1.768 3.182-1.768.353-2.121 2.121-1.415-1.414 2.122-2.121.353-1.768ZM8.98 13.287l1.414 1.414-5.303 5.303a1 1 0 0 1-1.492-1.327l.077-.087 5.304-5.303Z"
    />
  </svg>
);
export default SvgWrench;
