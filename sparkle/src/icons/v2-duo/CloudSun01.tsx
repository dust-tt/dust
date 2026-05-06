import type { SVGProps } from "react";
import * as React from "react";

const SvgCloudSun01 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20.965 8a3.965 3.965 0 1 0-7.93 0 1.035 1.035 0 0 1-2.07 0 6.035 6.035 0 1 1 8.893 5.316 1.035 1.035 0 0 1-.981-1.823A3.96 3.96 0 0 0 20.965 8"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M.965 16a6.035 6.035 0 0 1 5.527-6.013A6.53 6.53 0 0 1 12 6.965c2.72 0 5.05 1.662 6.034 4.025a5.536 5.536 0 0 1-.534 11.045H7A6.035 6.035 0 0 1 .965 16m2.07 0A3.965 3.965 0 0 0 7 19.965h10.5a3.465 3.465 0 1 0-.16-6.926 1.036 1.036 0 0 1-1.042-.754 4.467 4.467 0 0 0-8.277-.813c-.18.352-.546.572-.942.564H7A3.965 3.965 0 0 0 3.035 16"
    />
  </svg>
);
export default SvgCloudSun01;
