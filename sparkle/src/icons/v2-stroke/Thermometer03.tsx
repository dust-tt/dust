import type { SVGProps } from "react";
import * as React from "react";

const SvgThermometer03 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M9.465 4.5a1.465 1.465 0 1 0-2.93 0v9.258c0 .345-.172.668-.459.86a3.465 3.465 0 1 0 3.848 0 1.04 1.04 0 0 1-.46-.86zM8 17.465a.035.035 0 0 0-.035.035c0 .02.016.035.035.035q.015 0 .024-.01l.011-.025-.01-.024A.04.04 0 0 0 8 17.465m13-7.5a1.035 1.035 0 0 1 0 2.07h-6a1.035 1.035 0 0 1 0-2.07zm0-4a1.035 1.035 0 0 1 0 2.07h-6a1.035 1.035 0 0 1 0-2.07zm0-4a1.035 1.035 0 0 1 0 2.07h-6a1.035 1.035 0 0 1 0-2.07zM10.035 17.5a2.035 2.035 0 1 1-4.07 0 2.035 2.035 0 0 1 4.07 0m1.5-4.257a5.535 5.535 0 1 1-7.07 0V4.5a3.535 3.535 0 0 1 7.07 0z"
    />
  </svg>
);
export default SvgThermometer03;
