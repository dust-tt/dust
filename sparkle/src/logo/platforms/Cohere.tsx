import type { SVGProps } from "react";
import * as React from "react";
const SvgCohere = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect width={24} height={24} fill="#fff" rx={4} />
    <path
      fill="#355146"
      d="M3 8.132C3 5.049 5.394 2.55 8.348 2.55h8.537c2.093 0 3.79 1.771 3.79 3.956 0 1.582-.904 3.012-2.297 3.636l-5.902 2.64a10.666 10.666 0 0 1-4.277.933C5.334 13.736 3 11.318 3 8.327v-.195Z"
    />
    <path
      fill="#D9A6E5"
      d="M21 17.055c0 2.427-1.886 4.395-4.211 4.395h-2.803c-2.005 0-3.64-1.677-3.676-3.77-.027-1.582.879-3.02 2.282-3.62l2.493-1.066a4.132 4.132 0 0 1 1.59-.334h.079c2.34-.021 4.246 1.953 4.246 4.395Z"
    />
    <path
      fill="#FF7759"
      d="M3 17.659c0-1.782 1.384-3.226 3.09-3.226 1.707 0 3.09 1.444 3.09 3.226v.452c0 1.782-1.383 3.226-3.09 3.226-1.706 0-3.09-1.444-3.09-3.226v-.452Z"
    />
  </svg>
);
export default SvgCohere;
