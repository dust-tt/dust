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
      d="M12 5a7 7 0 0 0-6.93 8H3.056a9 9 0 0 1 15.554-7.11L20.5 4v5h-5l1.694-1.693A6.98 6.98 0 0 0 12 5M6.807 16.694 8.5 15h-5v5l1.89-1.89A9 9 0 0 0 20.945 11H18.93q.07.49.071 1a7 7 0 0 1-12.193 4.694"
    />
  </svg>
);
export default SvgArrowPath;
