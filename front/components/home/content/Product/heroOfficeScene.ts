/* eslint-disable */
// @ts-nocheck
// biome-ignore-all: imperative DOM/SVG scene ported from the
// landing-gather-remix design prototype. The animation, drag-and-drop, and
// SVG foreignObject chat cards rely on per-frame DOM mutation — rewriting as
// React idioms would lose visual fidelity. Keep this file self-contained.

// =============================================================================
// Static SVG markup — the isometric ground, four logo-shaped rooms, door
// lights, hidden room labels, and empty <g id="humans"> / <g id="agents">
// layers populated at runtime.
// =============================================================================

const STATIC_SVG_MARKUP = `<svg class="floor-svg" viewBox="0 0 1600 1100" preserveAspectRatio="xMidYMid meet" id="plan">
  <defs>
    <clipPath id="avatar-clip"><circle cx="0" cy="0" r="14"/></clipPath>
    <filter id="room-shadow" x="-10%" y="-10%" width="120%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="rgba(17,20,24,0.14)"/>
    </filter>
  </defs>

  <polygon class="ground" points="800.0,126.0 1600.2,588.0 800.0,1050.0 -0.2,588.0"/>
  <g class="ground-grid">
    <line class="grid-line" x1="800.0" y1="147.0" x2="36.2" y2="588.0"/>
    <line class="grid-line" x1="800.0" y1="147.0" x2="1563.8" y2="588.0"/>
    <line class="grid-line" x1="881.8" y1="194.3" x2="118.0" y2="635.3"/>
    <line class="grid-line" x1="718.2" y1="194.3" x2="1482.0" y2="635.3"/>
    <line class="grid-line" x1="963.7" y1="241.5" x2="199.8" y2="682.5"/>
    <line class="grid-line" x1="636.3" y1="241.5" x2="1400.2" y2="682.5"/>
    <line class="grid-line" x1="1045.5" y1="288.8" x2="281.7" y2="729.8"/>
    <line class="grid-line" x1="554.5" y1="288.8" x2="1318.3" y2="729.8"/>
    <line class="grid-line" x1="1127.4" y1="336.0" x2="363.5" y2="777.0"/>
    <line class="grid-line" x1="472.6" y1="336.0" x2="1236.5" y2="777.0"/>
    <line class="grid-line" x1="1209.2" y1="383.3" x2="445.4" y2="824.3"/>
    <line class="grid-line" x1="390.8" y1="383.3" x2="1154.6" y2="824.3"/>
    <line class="grid-line" x1="1291.0" y1="430.5" x2="527.2" y2="871.5"/>
    <line class="grid-line" x1="309.0" y1="430.5" x2="1072.8" y2="871.5"/>
    <line class="grid-line" x1="1372.9" y1="477.8" x2="609.0" y2="918.8"/>
    <line class="grid-line" x1="227.1" y1="477.8" x2="991.0" y2="918.8"/>
    <line class="grid-line" x1="1454.7" y1="525.0" x2="690.9" y2="966.0"/>
    <line class="grid-line" x1="145.3" y1="525.0" x2="909.1" y2="966.0"/>
    <line class="grid-line" x1="1536.6" y1="572.3" x2="772.7" y2="1013.3"/>
    <line class="grid-line" x1="63.4" y1="572.3" x2="827.3" y2="1013.3"/>
  </g>

  <g class="room-block" data-room="office-d">
    <polygon class="wall wall-logo" points="472.6,325.5 800.0,136.5 800.0,210.0 472.6,399.0"/><polygon class="wall wall-logo" points="636.3,420.0 472.6,325.5 472.6,399.0 636.3,493.5"/><polygon class="wall wall-logo" points="800.0,136.5 963.7,231.0 963.7,304.5 800.0,210.0"/><polygon class="wall wall-logo" points="651.2,427.9 636.3,420.0 636.3,493.5 651.2,501.4"/><polygon class="wall wall-logo" points="667.2,435.0 651.2,427.9 651.2,501.4 667.2,508.5"/><polygon class="wall wall-logo" points="684.3,441.2 667.2,435.0 667.2,508.5 684.3,514.7"/><polygon class="wall wall-logo" points="702.2,446.6 684.3,441.2 684.3,514.7 702.2,520.1"/><polygon class="wall wall-logo" points="720.8,451.1 702.2,446.6 702.2,520.1 720.8,524.6"/><polygon class="wall wall-logo" points="740.1,454.6 720.8,451.1 720.8,524.6 740.1,528.1"/><polygon class="wall wall-logo" points="963.7,231.0 977.3,239.6 977.3,313.1 963.7,304.5"/><polygon class="wall wall-logo" points="759.8,457.1 740.1,454.6 740.1,528.1 759.8,530.6"/><polygon class="wall wall-logo" points="977.3,239.6 989.6,248.8 989.6,322.3 977.3,313.1"/><polygon class="wall wall-logo" points="779.8,458.6 759.8,457.1 759.8,530.6 779.8,532.1"/><polygon class="wall wall-logo" points="989.6,248.8 1000.5,258.7 1000.5,332.2 989.6,322.3"/><polygon class="wall wall-logo" points="800.0,459.1 779.8,458.6 779.8,532.1 800.0,532.6"/><polygon class="wall wall-logo" points="1000.5,258.7 1009.8,269.0 1009.8,342.5 1000.5,332.2"/><polygon class="wall wall-logo" points="820.2,458.6 800.0,459.1 800.0,532.6 820.2,532.1"/><polygon class="wall wall-logo" points="1009.8,269.0 1017.5,279.8 1017.5,353.3 1009.8,342.5"/><polygon class="wall wall-logo" points="840.2,457.1 820.2,458.6 820.2,532.1 840.2,530.6"/><polygon class="wall wall-logo" points="1017.5,279.8 1023.6,290.9 1023.6,364.4 1017.5,353.3"/><polygon class="wall wall-logo" points="859.9,454.6 840.2,457.1 840.2,530.6 859.9,528.1"/><polygon class="wall wall-logo" points="1023.6,290.9 1028.0,302.3 1028.0,375.8 1023.6,364.4"/><polygon class="wall wall-logo" points="879.2,451.1 859.9,454.6 859.9,528.1 879.2,524.6"/><polygon class="wall wall-logo" points="1028.0,302.3 1030.6,313.9 1030.6,387.4 1028.0,375.8"/><polygon class="wall wall-logo" points="897.8,446.6 879.2,451.1 879.2,524.6 897.8,520.1"/><polygon class="wall wall-logo" points="1030.6,313.9 1031.5,325.5 1031.5,399.0 1030.6,387.4"/><polygon class="wall wall-logo" points="915.7,441.2 897.8,446.6 897.8,520.1 915.7,514.7"/><polygon class="wall wall-logo" points="1031.5,325.5 1030.6,337.1 1030.6,410.6 1031.5,399.0"/><polygon class="wall wall-logo" points="932.8,435.0 915.7,441.2 915.7,514.7 932.8,508.5"/><polygon class="wall wall-logo" points="1030.6,337.1 1028.0,348.7 1028.0,422.2 1030.6,410.6"/><polygon class="wall wall-logo" points="948.8,427.9 932.8,435.0 932.8,508.5 948.8,501.4"/><polygon class="wall wall-logo" points="1028.0,348.7 1023.6,360.1 1023.6,433.6 1028.0,422.2"/><polygon class="wall wall-logo" points="963.7,420.0 948.8,427.9 948.8,501.4 963.7,493.5"/><polygon class="wall wall-logo" points="1023.6,360.1 1017.5,371.2 1017.5,444.7 1023.6,433.6"/><polygon class="wall wall-logo" points="977.3,411.4 963.7,420.0 963.7,493.5 977.3,484.9"/><polygon class="wall wall-logo" points="1017.5,371.2 1009.8,382.0 1009.8,455.5 1017.5,444.7"/><polygon class="wall wall-logo" points="989.6,402.2 977.3,411.4 977.3,484.9 989.6,475.7"/><polygon class="wall wall-logo" points="1009.8,382.0 1000.5,392.3 1000.5,465.8 1009.8,455.5"/><polygon class="wall wall-logo" points="1000.5,392.3 989.6,402.2 989.6,475.7 1000.5,465.8"/>
    <polygon class="roof-logo" fill="#ECEAE3" points="800.0,136.5 963.7,231.0 977.3,239.6 989.6,248.8 1000.5,258.7 1009.8,269.0 1017.5,279.8 1023.6,290.9 1028.0,302.3 1030.6,313.9 1031.5,325.5 1030.6,337.1 1028.0,348.7 1023.6,360.1 1017.5,371.2 1009.8,382.0 1000.5,392.3 989.6,402.2 977.3,411.4 963.7,420.0 948.8,427.9 932.8,435.0 915.7,441.2 897.8,446.6 879.2,451.1 859.9,454.6 840.2,457.1 820.2,458.6 800.0,459.1 779.8,458.6 759.8,457.1 740.1,454.6 720.8,451.1 702.2,446.6 684.3,441.2 667.2,435.0 651.2,427.9 636.3,420.0 472.6,325.5"/>
    <polyline class="roof-edge" points="800.0,136.5 963.7,231.0 977.3,239.6 989.6,248.8 1000.5,258.7 1009.8,269.0 1017.5,279.8 1023.6,290.9 1028.0,302.3 1030.6,313.9 1031.5,325.5 1030.6,337.1 1028.0,348.7 1023.6,360.1 1017.5,371.2 1009.8,382.0 1000.5,392.3 989.6,402.2 977.3,411.4 963.7,420.0 948.8,427.9 932.8,435.0 915.7,441.2 897.8,446.6 879.2,451.1 859.9,454.6 840.2,457.1 820.2,458.6 800.0,459.1 779.8,458.6 759.8,457.1 740.1,454.6 720.8,451.1 702.2,446.6 684.3,441.2 667.2,435.0 651.2,427.9 636.3,420.0 472.6,325.5 800.0,136.5"/>
  </g>
  <g class="room-block" data-room="office-c">
    <polygon class="wall wall-logo" points="926.9,447.7 937.7,437.8 937.7,511.3 926.9,521.2"/><polygon class="wall wall-logo" points="917.6,458.0 926.9,447.7 926.9,521.2 917.6,531.5"/><polygon class="wall wall-logo" points="937.7,437.8 950.0,428.6 950.0,502.1 937.7,511.3"/><polygon class="wall wall-logo" points="909.8,468.8 917.6,458.0 917.6,531.5 909.8,542.3"/><polygon class="wall wall-logo" points="950.0,428.6 963.7,420.0 963.7,493.5 950.0,502.1"/><polygon class="wall wall-logo" points="903.8,479.9 909.8,468.8 909.8,542.3 903.8,553.4"/><polygon class="wall wall-logo" points="899.4,491.3 903.8,479.9 903.8,553.4 899.4,564.8"/><polygon class="wall wall-logo" points="896.8,502.9 899.4,491.3 899.4,564.8 896.8,576.4"/><polygon class="wall wall-logo" points="895.9,514.5 896.8,502.9 896.8,576.4 895.9,588.0"/><polygon class="wall wall-logo" points="896.8,526.1 895.9,514.5 895.9,588.0 896.8,599.6"/><polygon class="wall wall-logo" points="963.7,420.0 1127.4,325.5 1127.4,399.0 963.7,493.5"/><polygon class="wall wall-logo" points="899.4,537.7 896.8,526.1 896.8,599.6 899.4,611.2"/><polygon class="wall wall-logo" points="903.8,549.1 899.4,537.7 899.4,611.2 903.8,622.6"/><polygon class="wall wall-logo" points="909.8,560.2 903.8,549.1 903.8,622.6 909.8,633.7"/><polygon class="wall wall-logo" points="917.6,571.0 909.8,560.2 909.8,633.7 917.6,644.5"/><polygon class="wall wall-logo" points="926.9,581.3 917.6,571.0 917.6,644.5 926.9,654.8"/><polygon class="wall wall-logo" points="937.7,591.2 926.9,581.3 926.9,654.8 937.7,664.7"/><polygon class="wall wall-logo" points="950.0,600.4 937.7,591.2 937.7,664.7 950.0,673.9"/><polygon class="wall wall-logo" points="963.7,609.0 950.0,600.4 950.0,673.9 963.7,682.5"/><polygon class="wall wall-logo" points="978.6,616.9 963.7,609.0 963.7,682.5 978.6,690.4"/><polygon class="wall wall-logo" points="994.6,624.0 978.6,616.9 978.6,690.4 994.6,697.5"/><polygon class="wall wall-logo" points="1011.6,630.2 994.6,624.0 994.6,697.5 1011.6,703.7"/><polygon class="wall wall-logo" points="1029.5,635.6 1011.6,630.2 1011.6,703.7 1029.5,709.1"/><polygon class="wall wall-logo" points="1048.2,640.1 1029.5,635.6 1029.5,709.1 1048.2,713.6"/><polygon class="wall wall-logo" points="1067.4,643.6 1048.2,640.1 1048.2,713.6 1067.4,717.1"/><polygon class="wall wall-logo" points="1127.4,325.5 1454.7,514.5 1454.7,588.0 1127.4,399.0"/><polygon class="wall wall-logo" points="1087.2,646.1 1067.4,643.6 1067.4,717.1 1087.2,719.6"/><polygon class="wall wall-logo" points="1107.2,647.6 1087.2,646.1 1087.2,719.6 1107.2,721.1"/><polygon class="wall wall-logo" points="1127.4,648.1 1107.2,647.6 1107.2,721.1 1127.4,721.6"/><polygon class="wall wall-logo" points="1147.5,647.6 1127.4,648.1 1127.4,721.6 1147.5,721.1"/><polygon class="wall wall-logo" points="1167.6,646.1 1147.5,647.6 1147.5,721.1 1167.6,719.6"/><polygon class="wall wall-logo" points="1187.3,643.6 1167.6,646.1 1167.6,719.6 1187.3,717.1"/><polygon class="wall wall-logo" points="1206.5,640.1 1187.3,643.6 1187.3,717.1 1206.5,713.6"/><polygon class="wall wall-logo" points="1225.2,635.6 1206.5,640.1 1206.5,713.6 1225.2,709.1"/><polygon class="wall wall-logo" points="1243.1,630.2 1225.2,635.6 1225.2,709.1 1243.1,703.7"/><polygon class="wall wall-logo" points="1260.1,624.0 1243.1,630.2 1243.1,703.7 1260.1,697.5"/><polygon class="wall wall-logo" points="1276.1,616.9 1260.1,624.0 1260.1,697.5 1276.1,690.4"/><polygon class="wall wall-logo" points="1291.0,609.0 1276.1,616.9 1276.1,690.4 1291.0,682.5"/><polygon class="wall wall-logo" points="1454.7,514.5 1291.0,609.0 1291.0,682.5 1454.7,588.0"/>
    <polygon class="roof-logo" fill="#ECEAE3" points="1127.4,325.5 1454.7,514.5 1291.0,609.0 1276.1,616.9 1260.1,624.0 1243.1,630.2 1225.2,635.6 1206.5,640.1 1187.3,643.6 1167.6,646.1 1147.5,647.6 1127.4,648.1 1107.2,647.6 1087.2,646.1 1067.4,643.6 1048.2,640.1 1029.5,635.6 1011.6,630.2 994.6,624.0 978.6,616.9 963.7,609.0 950.0,600.4 937.7,591.2 926.9,581.3 917.6,571.0 909.8,560.2 903.8,549.1 899.4,537.7 896.8,526.1 895.9,514.5 896.8,502.9 899.4,491.3 903.8,479.9 909.8,468.8 917.6,458.0 926.9,447.7 937.7,437.8 950.0,428.6 963.7,420.0"/>
    <polyline class="roof-edge" points="1127.4,325.5 1454.7,514.5 1291.0,609.0 1276.1,616.9 1260.1,624.0 1243.1,630.2 1225.2,635.6 1206.5,640.1 1187.3,643.6 1167.6,646.1 1147.5,647.6 1127.4,648.1 1107.2,647.6 1087.2,646.1 1067.4,643.6 1048.2,640.1 1029.5,635.6 1011.6,630.2 994.6,624.0 978.6,616.9 963.7,609.0 950.0,600.4 937.7,591.2 926.9,581.3 917.6,571.0 909.8,560.2 903.8,549.1 899.4,537.7 896.8,526.1 895.9,514.5 896.8,502.9 899.4,491.3 903.8,479.9 909.8,468.8 917.6,458.0 926.9,447.7 937.7,437.8 950.0,428.6 963.7,420.0 1127.4,325.5"/>
  </g>

  <g class="room-block" data-room="office-t">
    <polygon class="wall wall-logo" points="454.2,433.8 462.7,426.6 462.7,500.1 454.2,507.3"/><polygon class="wall wall-logo" points="447.6,441.7 454.2,433.8 454.2,507.3 447.6,515.2"/><polygon class="wall wall-logo" points="462.7,426.6 472.6,420.0 472.6,493.5 462.7,500.1"/><polygon class="wall wall-logo" points="442.7,450.0 447.6,441.7 447.6,515.2 442.7,523.5"/><polygon class="wall wall-logo" points="472.6,420.0 484.0,414.2 484.0,487.7 472.6,493.5"/><polygon class="wall wall-logo" points="439.7,458.5 442.7,450.0 442.7,523.5 439.7,532.0"/><polygon class="wall wall-logo" points="484.0,414.2 496.6,409.4 496.6,482.9 484.0,487.7"/><polygon class="wall wall-logo" points="438.7,467.3 439.7,458.5 439.7,532.0 438.7,540.8"/><polygon class="wall wall-logo" points="496.6,409.4 510.2,405.5 510.2,479.0 496.6,482.9"/><polygon class="wall wall-logo" points="439.7,476.0 438.7,467.3 438.7,540.8 439.7,549.5"/><polygon class="wall wall-logo" points="510.2,405.5 524.5,402.7 524.5,476.2 510.2,479.0"/><polygon class="wall wall-logo" points="442.7,484.5 439.7,476.0 439.7,549.5 442.7,558.0"/><polygon class="wall wall-logo" points="524.5,402.7 539.4,401.0 539.4,474.5 524.5,476.2"/><polygon class="wall wall-logo" points="447.6,492.8 442.7,484.5 442.7,558.0 447.6,566.3"/><polygon class="wall wall-logo" points="539.4,401.0 554.5,400.4 554.5,473.9 539.4,474.5"/><polygon class="wall wall-logo" points="454.2,500.7 447.6,492.8 447.6,566.3 454.2,574.2"/><polygon class="wall wall-logo" points="554.5,400.4 569.6,401.0 569.6,474.5 554.5,473.9"/><polygon class="wall wall-logo" points="462.7,507.9 454.2,500.7 454.2,574.2 462.7,581.4"/><polygon class="wall wall-logo" points="569.6,401.0 584.4,402.7 584.4,476.2 569.6,474.5"/><polygon class="wall wall-logo" points="472.6,514.5 462.7,507.9 462.7,581.4 472.6,588.0"/><polygon class="wall wall-logo" points="584.4,402.7 598.8,405.5 598.8,479.0 584.4,476.2"/><polygon class="wall wall-logo" points="598.8,405.5 612.4,409.4 612.4,482.9 598.8,479.0"/><polygon class="wall wall-logo" points="612.4,409.4 624.9,414.2 624.9,487.7 612.4,482.9"/><polygon class="wall wall-logo" points="624.9,414.2 636.3,420.0 636.3,493.5 624.9,487.7"/><polygon class="wall wall-logo" points="636.3,609.0 472.6,514.5 472.6,588.0 636.3,682.5"/><polygon class="wall wall-logo" points="472.6,703.5 636.3,609.0 636.3,682.5 472.6,777.0"/><polygon class="wall wall-logo" points="636.3,798.0 472.6,703.5 472.6,777.0 636.3,871.5"/><polygon class="wall wall-logo" points="636.3,420.0 1127.4,703.5 1127.4,777.0 636.3,493.5"/><polygon class="wall wall-logo" points="800.0,703.5 636.3,798.0 636.3,871.5 800.0,777.0"/><polygon class="wall wall-logo" points="963.7,798.0 800.0,703.5 800.0,777.0 963.7,871.5"/><polygon class="wall wall-logo" points="1127.4,703.5 963.7,798.0 963.7,871.5 1127.4,777.0"/>
    <polygon class="roof-logo" fill="#ECEAE3" points="636.3,798.0 472.6,703.5 636.3,609.0 472.6,514.5 462.7,507.9 454.2,500.7 447.6,492.8 442.7,484.5 439.7,476.0 438.7,467.3 439.7,458.5 442.7,450.0 447.6,441.7 454.2,433.8 462.7,426.6 472.6,420.0 484.0,414.2 496.6,409.4 510.2,405.5 524.5,402.7 539.4,401.0 554.5,400.4 569.6,401.0 584.4,402.7 598.8,405.5 612.4,409.4 624.9,414.2 636.3,420.0 1127.4,703.5 963.7,798.0 800.0,703.5"/>
    <polyline class="roof-edge" points="636.3,798.0 472.6,703.5 636.3,609.0 472.6,514.5 462.7,507.9 454.2,500.7 447.6,492.8 442.7,484.5 439.7,476.0 438.7,467.3 439.7,458.5 442.7,450.0 447.6,441.7 454.2,433.8 462.7,426.6 472.6,420.0 484.0,414.2 496.6,409.4 510.2,405.5 524.5,402.7 539.4,401.0 554.5,400.4 569.6,401.0 584.4,402.7 598.8,405.5 612.4,409.4 624.9,414.2 636.3,420.0 1127.4,703.5 963.7,798.0 800.0,703.5 636.3,798.0"/>
  </g>
  <g class="room-block" data-room="office-bl">
    <polygon class="wall wall-logo" points="145.3,514.5 309.0,420.0 309.0,493.5 145.3,588.0"/><polygon class="wall wall-logo" points="309.0,609.0 145.3,514.5 145.3,588.0 309.0,682.5"/><polygon class="wall wall-logo" points="309.0,420.0 472.6,514.5 472.6,588.0 309.0,493.5"/><polygon class="wall wall-logo" points="320.3,614.8 309.0,609.0 309.0,682.5 320.3,688.3"/><polygon class="wall wall-logo" points="332.9,619.6 320.3,614.8 320.3,688.3 332.9,693.1"/><polygon class="wall wall-logo" points="346.5,623.5 332.9,619.6 332.9,693.1 346.5,697.0"/><polygon class="wall wall-logo" points="360.8,626.3 346.5,623.5 346.5,697.0 360.8,699.8"/><polygon class="wall wall-logo" points="472.6,514.5 482.6,521.1 482.6,594.6 472.6,588.0"/><polygon class="wall wall-logo" points="375.7,628.0 360.8,626.3 360.8,699.8 375.7,701.5"/><polygon class="wall wall-logo" points="482.6,521.1 491.0,528.3 491.0,601.8 482.6,594.6"/><polygon class="wall wall-logo" points="390.8,628.6 375.7,628.0 375.7,701.5 390.8,702.1"/><polygon class="wall wall-logo" points="491.0,528.3 497.7,536.2 497.7,609.7 491.0,601.8"/><polygon class="wall wall-logo" points="405.9,628.0 390.8,628.6 390.8,702.1 405.9,701.5"/><polygon class="wall wall-logo" points="497.7,536.2 502.6,544.5 502.6,618.0 497.7,609.7"/><polygon class="wall wall-logo" points="420.8,626.3 405.9,628.0 405.9,701.5 420.8,699.8"/><polygon class="wall wall-logo" points="502.6,544.5 505.6,553.0 505.6,626.5 502.6,618.0"/><polygon class="wall wall-logo" points="435.1,623.5 420.8,626.3 420.8,699.8 435.1,697.0"/><polygon class="wall wall-logo" points="505.6,553.0 506.5,561.8 506.5,635.3 505.6,626.5"/><polygon class="wall wall-logo" points="448.7,619.6 435.1,623.5 435.1,697.0 448.7,693.1"/><polygon class="wall wall-logo" points="506.5,561.8 505.6,570.5 505.6,644.0 506.5,635.3"/><polygon class="wall wall-logo" points="461.3,614.8 448.7,619.6 448.7,693.1 461.3,688.3"/><polygon class="wall wall-logo" points="505.6,570.5 502.6,579.0 502.6,652.5 505.6,644.0"/><polygon class="wall wall-logo" points="472.6,609.0 461.3,614.8 461.3,688.3 472.6,682.5"/><polygon class="wall wall-logo" points="502.6,579.0 497.7,587.3 497.7,660.8 502.6,652.5"/><polygon class="wall wall-logo" points="482.6,602.4 472.6,609.0 472.6,682.5 482.6,675.9"/><polygon class="wall wall-logo" points="497.7,587.3 491.0,595.2 491.0,668.7 497.7,660.8"/><polygon class="wall wall-logo" points="491.0,595.2 482.6,602.4 482.6,675.9 491.0,668.7"/>
    <polygon class="roof-logo" fill="#ECEAE3" points="472.6,514.5 482.6,521.1 491.0,528.3 497.7,536.2 502.6,544.5 505.6,553.0 506.5,561.8 505.6,570.5 502.6,579.0 497.7,587.3 491.0,595.2 482.6,602.4 472.6,609.0 461.3,614.8 448.7,619.6 435.1,623.5 420.8,626.3 405.9,628.0 390.8,628.6 375.7,628.0 360.8,626.3 346.5,623.5 332.9,619.6 320.3,614.8 309.0,609.0 145.3,514.5 309.0,420.0"/>
    <polyline class="roof-edge" points="472.6,514.5 482.6,521.1 491.0,528.3 497.7,536.2 502.6,544.5 505.6,553.0 506.5,561.8 505.6,570.5 502.6,579.0 497.7,587.3 491.0,595.2 482.6,602.4 472.6,609.0 461.3,614.8 448.7,619.6 435.1,623.5 420.8,626.3 405.9,628.0 390.8,628.6 375.7,628.0 360.8,626.3 346.5,623.5 332.9,619.6 320.3,614.8 309.0,609.0 145.3,514.5 309.0,420.0 472.6,514.5"/>
  </g>

  <g id="doors">
    <circle id="light-office-d" class="door-light" cx="887.7" cy="449.7" r="14"/>
    <circle id="light-office-c" class="door-light" cx="1039.6" cy="638.7" r="14"/>
    <circle id="light-office-bl" class="door-light" cx="424.9" cy="654.9" r="14"/>
    <circle id="light-office-t" class="door-light" cx="556.4" cy="566.3" r="14"/>
  </g>

  <g class="room-label-g" transform="translate(790.9,183.8)">
    <circle class="room-chip" cx="0" cy="-2" r="4.5" fill="#E2F78C"/>
    <text class="room-label" x="14" y="3">Engineering</text>
  </g>
  <g class="room-label-g" transform="translate(1218.3,420.0)">
    <circle class="room-chip" cx="0" cy="-2" r="4.5" fill="#FFC3DF"/>
    <text class="room-label" x="14" y="3">Marketing</text>
  </g>
  <g class="room-label-g" transform="translate(254.4,472.5)">
    <circle class="room-chip" cx="0" cy="-2" r="4.5" fill="#9FDBFF"/>
    <text class="room-label" x="14" y="3">Support</text>
  </g>
  <g class="room-label-g" transform="translate(581.8,472.5)">
    <circle class="room-chip" cx="0" cy="-2" r="4.5" fill="#3B82F6"/>
    <text class="room-label" x="14" y="3">Product · Sales</text>
  </g>

  <g id="humans"></g>
  <g id="agents"></g>
</svg>`;

// =============================================================================
// Scoped CSS — covers the SVG scene, agent labels, chat cards (rendered inside
// SVG <foreignObject>), reaction pills, and the flying-emoji absolute layer.
// All variables and keyframes are namespaced inside .dust-floor-host so they
// don't leak into the rest of the site.
// =============================================================================

const SCENE_CSS = `
.dust-floor-host {
  --gray-50:  #F7F7F7;
  --gray-100: #EEEEEF;
  --gray-150: #DFE0E2;
  --gray-200: #D3D5D9;
  --gray-700: #364153;
  --gray-800: #2A3241;
  --gray-900: #1C222D;
  --gray-950: #111418;
  --blue-200: #9FDBFF;
  --blue-400: #4BABFF;
  --blue-500: #1C91FF;
  --green-200: #E2F78C;
  --font-sans: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.dust-floor-host .floor-svg {
  width: 100%;
  height: 100%;
  max-height: 100vh;
  display: block;
  pointer-events: auto;
}

/* ---------------- Floor plan pieces ---------------- */
.dust-floor-host .room-label {
  font: 600 12px/1 var(--font-sans); letter-spacing: -0.2px;
  fill: var(--gray-900); text-transform: none;
}
.dust-floor-host .room-count {
  font: 500 9.5px/1 var(--font-mono); letter-spacing: 0.02em;
  fill: #596170;
}
.dust-floor-host .room-rect {
  fill: #FFFFFF; stroke: var(--gray-200); stroke-width: 1.5;
}
.dust-floor-host .room-chip { stroke: rgba(17,20,24,0.06); stroke-width: 0.8; }
.dust-floor-host .room-divider { stroke: var(--gray-150); stroke-width: 1; }
.dust-floor-host .room-pill-bg {
  fill: var(--gray-50); stroke: var(--gray-150); stroke-width: 0.8;
}
.dust-floor-host .corridor {
  fill: #FAFAFA; stroke: var(--gray-150); stroke-width: 1; stroke-dasharray: 3 4;
}
.dust-floor-host .door { stroke: #FFFFFF; stroke-width: 4; stroke-linecap: round; }
.dust-floor-host .wall-shadow { fill: rgba(17,20,24,0.04); }
.dust-floor-host .desk { fill: var(--gray-100); stroke: var(--gray-200); stroke-width: 1; rx: 3; }
.dust-floor-host .chair { fill: var(--gray-200); }
.dust-floor-host .plant { fill: var(--green-200); }

/* Humans */
.dust-floor-host .human { transform-box: fill-box; transform-origin: center; }
.dust-floor-host .human-body {
  animation: dust-floor-human-bob 3.6s ease-in-out infinite;
  transform-box: fill-box; transform-origin: 50% 50%;
}
@keyframes dust-floor-human-bob {
  0%,100% { transform: translateY(0) scale(1); }
  50%     { transform: translateY(-0.8px) scale(1.03); }
}
.dust-floor-host .human.sway .human-body { animation-duration: 4.8s; animation-name: dust-floor-human-bob; }

.dust-floor-host .status-dot { stroke: #FFFFFF; stroke-width: 1.5; }
.dust-floor-host .status-online { fill: #3BA55D; }
.dust-floor-host .status-idle   { fill: #FAA81A; }
.dust-floor-host .status-busy   { fill: #ED4245; }
.dust-floor-host .status-online-pulse {
  animation: dust-floor-status-pulse 2.4s ease-out infinite;
  transform-box: fill-box; transform-origin: 50% 50%;
}
@keyframes dust-floor-status-pulse {
  0%   { opacity: .5; transform: scale(1); }
  70%  { opacity: 0;  transform: scale(2.6); }
  100% { opacity: 0;  transform: scale(2.6); }
}

.dust-floor-host .activity-emoji { transform-box: fill-box; transform-origin: 50% 50%; }
.dust-floor-host .activity-emoji.pop { animation: dust-floor-emoji-pop 420ms cubic-bezier(.2,.8,.2,1); }
@keyframes dust-floor-emoji-pop {
  0%   { transform: scale(0.4); opacity: 0; }
  60%  { transform: scale(1.25); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

/* AI agents */
.dust-floor-host .agent {
  transform: translate(var(--x, 0px), var(--y, 0px));
  cursor: grab;
}
.dust-floor-host .agent:active,
.dust-floor-host .agent.dragging { cursor: grabbing; }
.dust-floor-host .agent.dragging .agent-body { animation: none; transform: scale(1.25); }
.dust-floor-host .agent.dragging .agent-halo { opacity: 0.6; transform: scale(2.2); animation: none; }
.dust-floor-host .agent-body {
  transform-box: fill-box; transform-origin: 50% 50%;
  animation: dust-floor-agent-pulse 4.6s ease-in-out infinite;
}
@keyframes dust-floor-agent-pulse {
  0%,100% { transform: scale(1); }
  50%     { transform: scale(1.03); }
}
.dust-floor-host .agent-halo {
  transform-box: fill-box; transform-origin: 50% 50%;
  animation: dust-floor-halo 4.6s ease-in-out infinite;
}
@keyframes dust-floor-halo {
  0%,100% { opacity: .28; transform: scale(1); }
  50%     { opacity: .12; transform: scale(1.4); }
}
.dust-floor-host .agent-trail {
  stroke-dasharray: 2 4;
  animation: dust-floor-trail-dash 1.2s linear infinite;
}
@keyframes dust-floor-trail-dash {
  to { stroke-dashoffset: -12; }
}
.dust-floor-host .agent.working .agent-halo {
  animation: dust-floor-halo-working 3.4s ease-in-out infinite;
}
@keyframes dust-floor-halo-working {
  0%,100% { opacity: .34; transform: scale(1.05); }
  50%     { opacity: .14; transform: scale(1.6); }
}
.dust-floor-host .agent-spark {
  transform-box: fill-box; transform-origin: 50% 50%;
  animation: dust-floor-spark-rotate 6s linear infinite;
}
@keyframes dust-floor-spark-rotate { to { transform: rotate(360deg); } }

.dust-floor-host .agent-tag rect {
  transition: fill 180ms ease, stroke 180ms ease, x 260ms cubic-bezier(.2,.8,.2,1), width 260ms cubic-bezier(.2,.8,.2,1);
  fill: #FFFFFF;
  stroke: var(--gray-200);
}
.dust-floor-host .agent-tag text {
  font: 600 18px/1 var(--font-mono);
  letter-spacing: 0;
  fill: var(--gray-800);
  transition: fill 180ms ease;
}
.dust-floor-host .agent.talking .agent-tag rect {
  fill: #111418; stroke: #111418;
  filter: drop-shadow(0 3px 10px rgba(17,20,24,0.25));
}
.dust-floor-host .agent.talking .agent-tag text {
  fill: #FFFFFF;
  font: 500 20px/1.35 var(--font-sans);
  letter-spacing: -0.2px;
}
.dust-floor-host .person-bubble text {
  font: 500 20px/1.35 var(--font-sans);
  letter-spacing: -0.2px;
}

/* Chat cards (foreignObject HTML) */
.dust-floor-host .chat-card {
  box-sizing: border-box;
  background: #FDFCF7;
  border: 1px solid rgba(17,20,24,0.08);
  border-radius: 22px;
  padding: 20px 24px 18px;
  font-family: var(--font-sans);
  color: #1A1D21;
  box-shadow: 0 16px 40px -10px rgba(17,20,24,0.22), 0 3px 8px rgba(17,20,24,0.08);
  opacity: 1;
  position: relative;
}
.dust-floor-host .chat-card::after {
  content: "";
  position: absolute;
  left: 50%; bottom: -9px;
  width: 16px; height: 16px;
  transform: translateX(-50%) rotate(45deg);
  background: #FDFCF7;
  border-right: 1px solid rgba(17,20,24,0.08);
  border-bottom: 1px solid rgba(17,20,24,0.08);
  border-bottom-right-radius: 4px;
}
.dust-floor-host .chat-card.agent-card::after {
  border-right-color: rgba(28,145,255,0.22);
  border-bottom-color: rgba(28,145,255,0.22);
}
.dust-floor-host .chat-card.visible { opacity: 1; }
.dust-floor-host .chat-card.fade-out { opacity: 0; transition: opacity 220ms ease; }
.dust-floor-host .chat-card.agent-card {
  background: #FDFCF7;
  border-color: rgba(28,145,255,0.22);
}
.dust-floor-host .chat-card-header {
  display: flex; align-items: flex-start; gap: 12px;
  margin-bottom: 12px;
}
.dust-floor-host .chat-card-avatar {
  width: 42px; height: 42px;
  border-radius: 50%;
  background: #E9ECEF center/cover no-repeat;
  flex-shrink: 0;
  border: 1.5px solid rgba(17,20,24,0.06);
}
.dust-floor-host .chat-card-avatar.agent-avatar {
  background: #1C91FF;
  display: flex; align-items: center; justify-content: center;
  border-color: rgba(28,145,255,0.35);
}
.dust-floor-host .chat-card-avatar.agent-avatar svg { width: 22px; height: 22px; }
.dust-floor-host .chat-card-meta {
  display: flex; flex-direction: column;
  line-height: 1.15; gap: 3px; min-width: 0;
}
.dust-floor-host .chat-card-name {
  font: 600 19px/1.2 var(--font-sans); letter-spacing: -0.3px; color: #1A1D21;
}
.dust-floor-host .chat-card-role {
  font: 400 14px/1.2 var(--font-sans); color: #6A7078; letter-spacing: -0.1px;
}
.dust-floor-host .chat-card-role .dot { margin: 0 6px; opacity: 0.5; }
.dust-floor-host .chat-card-body {
  font: 400 18px/1.5 var(--font-sans); letter-spacing: -0.2px; color: #1A1D21;
  white-space: pre-wrap; word-break: break-word;
}
.dust-floor-host .chat-card-body strong { font-weight: 600; }
.dust-floor-host .chat-card-body .mention {
  display: inline-block;
  padding: 1px 7px; margin: 0 1px;
  background: rgba(28,145,255,0.14); color: #0F5CB3;
  border-radius: 7px; font-weight: 500;
}
.dust-floor-host .chat-card-body .mention.agent-mention {
  background: rgba(17,20,24,0.08); color: #1A1D21;
}
.dust-floor-host .chat-card-body ul {
  list-style: none; padding: 4px 0 2px; margin: 8px 0 0;
}
.dust-floor-host .chat-card-body ul li {
  position: relative; padding-left: 16px; margin: 7px 0; line-height: 1.4;
}
.dust-floor-host .chat-card-body ul li::before {
  content: ""; position: absolute; left: 2px; top: 11px;
  width: 5px; height: 5px; border-radius: 50%; background: #6A7078;
}
.dust-floor-host .chat-card-body .closer { margin-top: 12px; }
.dust-floor-host .chat-card-caret {
  display: inline-block;
  width: 8px; height: 1em; background: #1A1D21;
  vertical-align: -2px; margin-left: 1px;
  animation: dust-floor-caret-blink 0.9s steps(2,start) infinite;
}
.dust-floor-host .chat-card-reactions {
  display: flex; flex-wrap: wrap; gap: 7px; margin-top: 14px;
}
.dust-floor-host .chat-card-reactions:empty { display: none; }
.dust-floor-host .chat-card-reactions .react-pill {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 5px 12px 5px 10px;
  background: #FFFFFF;
  border: 1px solid rgba(17,20,24,0.1);
  border-radius: 999px;
  font: 600 16px/1 var(--font-sans);
  color: #1A1D21; letter-spacing: -0.1px;
  animation: dust-floor-pill-pop 360ms cubic-bezier(.2,1.4,.3,1);
  transform-origin: center;
}
.dust-floor-host .chat-card-reactions .react-pill .em { font-size: 18px; line-height: 1; }
.dust-floor-host .chat-card-reactions .react-pill .count { color: #4A5058; font-weight: 600; }

.dust-floor-host .reaction-pill rect {
  fill: #FFFFFF;
  stroke: rgba(17,20,24,0.12);
  stroke-width: 1;
  filter: drop-shadow(0 2px 5px rgba(17,20,24,0.12));
}
.dust-floor-host .reaction-pill.agent-pill rect { fill: #1C222D; stroke: #1C222D; }
.dust-floor-host .reaction-pill.agent-pill text { fill: #FFFFFF; }
.dust-floor-host .reaction-pill text {
  font: 600 14px/1 var(--font-sans);
  fill: var(--gray-900);
  letter-spacing: -0.1px;
}
.dust-floor-host .reaction-pill .em { font-size: 16px; }
.dust-floor-host .reaction-pill {
  transform-box: fill-box; transform-origin: center;
  animation: dust-floor-pill-pop 360ms cubic-bezier(.2,1.4,.3,1);
}
@keyframes dust-floor-pill-pop {
  0%   { transform: scale(0.2); opacity: 0; }
  60%  { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

/* Flying emoji — appended to document.body */
.dust-floor-fly-emoji {
  position: absolute;
  font-size: 26px; line-height: 1;
  pointer-events: none;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 2px 6px rgba(17,20,24,0.25));
  will-change: transform, opacity, left, top;
}

.dust-floor-host .agent-tag .caret {
  fill: #FFFFFF;
  animation: dust-floor-caret-blink 0.9s steps(2, start) infinite;
}
@keyframes dust-floor-caret-blink { 50% { opacity: 0; } }

.dust-floor-host .door-light {
  fill: var(--blue-500); opacity: 0; transition: opacity 250ms ease;
}
.dust-floor-host .door-light.flash { animation: dust-floor-door-flash 1.1s ease-out; }
@keyframes dust-floor-door-flash {
  0%   { opacity: 0; }
  30%  { opacity: .9; }
  100% { opacity: 0; }
}
.dust-floor-host .door-light.active { opacity: 0.35; animation: dust-floor-door-pulse 1.4s ease-in-out infinite; }
@keyframes dust-floor-door-pulse { 0%,100% { opacity: 0.25; } 50% { opacity: 0.55; } }

.dust-floor-host .room-rect.active { stroke: var(--blue-400); stroke-width: 2; }
.dust-floor-host .room-glow { fill: var(--blue-500); opacity: 0; transition: opacity 400ms ease; }
.dust-floor-host .room-glow.active { opacity: 0.06; }

/* Isometric 3D shapes */
.dust-floor-host .ground { fill: #FAFAF8; }
.dust-floor-host .grid-line { stroke: rgba(17,20,24,0.06); stroke-width: 1; }
.dust-floor-host .roof { fill: #FFFFFF; stroke: rgba(17,20,24,0.12); stroke-width: 1; }
.dust-floor-host [data-room="office-d"]  .roof-logo { fill: #E2F78C !important; }
.dust-floor-host [data-room="office-c"]  .roof-logo { fill: #FFC3DF !important; }
.dust-floor-host [data-room="office-bl"] .roof-logo { fill: #9FDBFF !important; }
.dust-floor-host [data-room="office-t"]  .roof-logo { fill: #3B82F6 !important; }
.dust-floor-host .roof-edge { fill: none; stroke: rgba(17,20,24,0.18); stroke-width: 1.2; stroke-linejoin: round; }
.dust-floor-host .wall-right { fill: #EFEEE9; stroke: rgba(17,20,24,0.14); stroke-width: 1; }
.dust-floor-host .wall-front { fill: #E5E4DE; stroke: rgba(17,20,24,0.14); stroke-width: 1; }
.dust-floor-host .room-block { filter: url(#room-shadow); transition: transform 300ms ease; cursor: default; }
.dust-floor-host .room-block.active .roof { fill: #FFFFFF; }
.dust-floor-host .room-block.active .roof-logo { filter: brightness(1.05); }
.dust-floor-host .room-block.active .wall-front { fill: #EAE9E3; }
.dust-floor-host .room-label-g { display: none; }

.dust-floor-host .wall-logo { fill: #ECEAE3; stroke: rgba(17,20,24,0.14); stroke-width: 1; }
.dust-floor-host .roof-logo { stroke: rgba(17,20,24,0.22); stroke-width: 1.2; }
.dust-floor-host .roof-colored { stroke: rgba(17,20,24,0.16); stroke-width: 1; }
`;

// =============================================================================
// Mount the floor scene into the host element. Returns a cleanup function that
// fully tears the scene down (cancels rAF, clears timers, removes window
// listeners, and resets the host).
//
// NB: This module is the literal port of the prototype IIFE. Anything that
// looks unidiomatic for React (raw DOM manipulation, _planX-style ad-hoc
// fields, document-level pointer listeners) is intentional — the prototype
// uses these to drive per-frame visuals that React's render cycle can't.
// =============================================================================

export function mountFloorScene(
  host: HTMLElement,
  avatarUrls: string[]
): () => void {
  // Inject scene CSS once (scoped to host class).
  const styleId = "dust-floor-scene-style";
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  let injectedStyle = false;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = styleId;
    styleEl.textContent = SCENE_CSS;
    document.head.appendChild(styleEl);
    injectedStyle = true;
  }

  host.innerHTML = STATIC_SVG_MARKUP;

  // Cleanup tracking
  const rafs = new Set<number>();
  const intervals = new Set<number>();
  const timeouts = new Set<number>();
  const winListeners: Array<[string, EventListener]> = [];
  const flyNodes = new Set<HTMLElement>();
  let disposed = false;

  const trackedRAF = (cb: FrameRequestCallback) => {
    const id = requestAnimationFrame((t) => {
      rafs.delete(id);
      cb(t);
    });
    rafs.add(id);
    return id;
  };
  const trackedSetInterval = (cb: () => void, ms: number) => {
    const id = window.setInterval(cb, ms);
    intervals.add(id);
    return id;
  };
  const trackedSetTimeout = (cb: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timeouts.delete(id);
      cb();
    }, ms);
    timeouts.add(id);
    return id;
  };
  const trackedWindowOn = (type: string, fn: EventListener) => {
    window.addEventListener(type, fn);
    winListeners.push([type, fn]);
  };

  // Scoped lookup — replaces the prototype's bare `document.getElementById`.
  const $byId = (id: string) =>
    host.querySelector(
      "#" + (window.CSS && window.CSS.escape ? window.CSS.escape(id) : id)
    );

  // ===========================================================================
  // Begin literal port of the prototype IIFE body. The only edits vs. the
  // original index.html are:
  //   1. `let avatars = [...hardcoded]` is replaced with the avatarUrls input.
  //   2. `document.getElementById(...)` calls that look up scene elements
  //      become `$byId(...)`.
  //   3. `setTimeout` / `setInterval` / `requestAnimationFrame` /
  //      `window.addEventListener` become tracked* equivalents so we can clean
  //      up on unmount.
  //   4. `document.body.appendChild(fly)` adds the node to a Set so we can
  //      remove orphaned flies on teardown.
  //   5. The infinite conductor loop checks `disposed` so it bails out cleanly
  //      after unmount.
  // ===========================================================================

  const SVG_NS = "http://www.w3.org/2000/svg";
  const ISO_SCALE = 1.05;
  const ISO_ORIGIN_X = 800;
  const ISO_ORIGIN_Y = 210;

  function _invIso(sx, sy) {
    const cos30 = 0.8660254;
    const sin30 = 0.5;
    const dx = (sx - ISO_ORIGIN_X) / ISO_SCALE;
    const dy = (sy - ISO_ORIGIN_Y) / ISO_SCALE;
    const px = dx / (2 * cos30) + dy / (2 * sin30);
    const py = -dx / (2 * cos30) + dy / (2 * sin30);
    return [px, py];
  }
  function iso(px, py, pz?) {
    if (pz === undefined) {
      pz = 0;
    }
    const cos30 = 0.8660254;
    const sin30 = 0.5;
    const sx = ISO_ORIGIN_X + (px - py) * cos30 * ISO_SCALE;
    const sy = ISO_ORIGIN_Y + (px + py) * sin30 * ISO_SCALE - pz * ISO_SCALE;
    return [sx, sy];
  }

  const rooms = {
    "office-d": {
      door: { x: 180, y: 360 },
      interior: [{ x: 20, y: 20, w: 320, h: 320 }],
      lightId: "light-office-d",
    },
    "office-c": {
      door: { x: 540, y: 360 },
      interior: [{ x: 380, y: 20, w: 320, h: 320 }],
      lightId: "light-office-c",
    },
    "office-bl": {
      door: { x: 120, y: 540 },
      interior: [{ x: 20, y: 560, w: 240, h: 140 }],
      lightId: "light-office-bl",
    },
    "office-t": {
      door: { x: 400, y: 360 },
      interior: [
        { x: 120, y: 380, w: 580, h: 150 },
        { x: 380, y: 530, w: 180, h: 190 },
      ],
      lightId: "light-office-t",
    },
  };
  const RAIL_Y = 780;

  const avatarColors = [
    "#5865F2",
    "#418B5C",
    "#1C91FF",
    "#FFAA0D",
    "#E14322",
    "#9B59B6",
    "#EB459E",
    "#00B8A3",
    "#F47B2A",
    "#596170",
  ];
  const initials = [
    "AL",
    "JM",
    "SR",
    "KT",
    "MP",
    "RD",
    "NB",
    "EH",
    "CV",
    "OF",
    "TY",
    "LG",
    "ZW",
    "HK",
    "BC",
    "DA",
    "IM",
    "PQ",
    "UX",
    "RN",
  ];

  // Avatars come from the caller (e.g. the dust team list) and are
  // Fisher-Yates shuffled here so each page load reseats the office.
  const avatars = avatarUrls.length
    ? avatarUrls.slice()
    : [
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ];
  for (let i = avatars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [avatars[i], avatars[j]] = [avatars[j], avatars[i]];
  }
  const statuses = [
    "online",
    "online",
    "online",
    "online",
    "idle",
    "online",
    "busy",
    "online",
  ];
  const activityEmojis = ["☕️", "🍽️", "🌴", "🎧", "📞", "🥑", "🍵", "🍕"];

  function buildHuman(cx, cy, seed = 0, roomKey = null) {
    const color = avatarColors[(seed * 7) % avatarColors.length];
    const _initial = initials[seed % initials.length];
    const status = statuses[seed % statuses.length];

    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", `human ${seed % 2 === 0 ? "sway" : ""}`);
    g.style.animationDelay = ((seed * 0.37) % 5) + "s";
    const [__sx, __sy] = iso(cx, cy, 22);
    g.setAttribute("transform", `translate(${__sx},${__sy})`);
    g._planX = cx;
    g._planY = cy;
    g._roomKey = roomKey;
    if (roomKey) {
      g.dataset.room = roomKey;
    }

    const sh = document.createElementNS(SVG_NS, "ellipse");
    sh.setAttribute("cx", "0");
    sh.setAttribute("cy", "22");
    sh.setAttribute("rx", "20");
    sh.setAttribute("ry", "5");
    sh.setAttribute("fill", "rgba(17,20,24,0.14)");
    g.appendChild(sh);

    const body = document.createElementNS(SVG_NS, "g");
    body.setAttribute("class", "human-body");

    const disc = document.createElementNS(SVG_NS, "circle");
    disc.setAttribute("cx", "0");
    disc.setAttribute("cy", "0");
    disc.setAttribute("r", "23");
    disc.setAttribute("fill", color);
    body.appendChild(disc);

    const url = avatars[seed % avatars.length];
    const photo = document.createElementNS(SVG_NS, "image");
    photo.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
    photo.setAttribute("href", url);
    photo.setAttribute("x", "-20");
    photo.setAttribute("y", "-20");
    photo.setAttribute("width", "40");
    photo.setAttribute("height", "40");
    photo.setAttribute("preserveAspectRatio", "xMidYMid slice");
    photo.style.clipPath = "circle(20px at 20px 20px)";
    body.appendChild(photo);

    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", "0");
    ring.setAttribute("cy", "0");
    ring.setAttribute("r", "20");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "#FFFFFF");
    ring.setAttribute("stroke-width", "0.75");
    body.appendChild(ring);

    const sx = 20,
      sy = 20;
    const useEmoji = (seed * 13) % 4 === 0;
    if (useEmoji) {
      const bg = document.createElementNS(SVG_NS, "circle");
      bg.setAttribute("cx", String(sx));
      bg.setAttribute("cy", String(sy));
      bg.setAttribute("r", "10.4");
      bg.setAttribute("fill", "#FFFFFF");
      bg.setAttribute("stroke", "rgba(17,20,24,0.08)");
      bg.setAttribute("stroke-width", "1.6");
      body.appendChild(bg);
      const emoji = document.createElementNS(SVG_NS, "text");
      emoji.setAttribute("text-anchor", "middle");
      emoji.setAttribute("x", String(sx));
      emoji.setAttribute("y", String(sy + 5.2));
      emoji.setAttribute(
        "style",
        "font: 14px/1 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji', sans-serif;"
      );
      emoji.setAttribute("class", "activity-emoji");
      emoji.textContent = activityEmojis[seed % activityEmojis.length];
      body.appendChild(emoji);
    } else {
      if (status === "online") {
        const pulse = document.createElementNS(SVG_NS, "circle");
        pulse.setAttribute("class", "status-online-pulse");
        pulse.setAttribute("cx", String(sx));
        pulse.setAttribute("cy", String(sy));
        pulse.setAttribute("r", "6");
        pulse.setAttribute("fill", "#3BA55D");
        body.appendChild(pulse);
      }
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("class", `status-dot status-${status}`);
      dot.setAttribute("cx", String(sx));
      dot.setAttribute("cy", String(sy));
      dot.setAttribute("r", "8");
      body.appendChild(dot);
    }

    g.appendChild(body);
    return g;
  }

  const humansLayer = $byId("humans");
  const roomPopulations = {
    "office-d": [
      [50, 40],
      [50, 200],
      [140, 60],
      [140, 280],
      [220, 120],
      [280, 180],
    ],
    "office-c": [
      [420, 60],
      [580, 60],
      [500, 170],
      [640, 160],
      [580, 280],
    ],
    "office-bl": [
      [40, 590],
      [110, 680],
      [180, 590],
      [240, 620],
    ],
    "office-t": [
      [150, 400],
      [310, 400],
      [470, 400],
      [630, 400],
      [400, 560],
      [470, 680],
      [440, 520],
    ],
  };
  let seed = 0;
  for (const [room, pts] of Object.entries(roomPopulations)) {
    for (const [x, y] of pts as [number, number][]) {
      humansLayer.appendChild(buildHuman(x, y, seed++, room));
    }
  }

  trackedSetInterval(() => {
    const all = humansLayer.querySelectorAll(".activity-emoji");
    if (!all.length) {
      return;
    }
    const howMany = 1 + (Math.random() < 0.35 ? 1 : 0);
    for (let i = 0; i < howMany; i++) {
      const el = all[Math.floor(Math.random() * all.length)];
      let next =
        activityEmojis[Math.floor(Math.random() * activityEmojis.length)];
      if (next === el.textContent) {
        next =
          activityEmojis[
            (activityEmojis.indexOf(next) + 1) % activityEmojis.length
          ];
      }
      el.textContent = next;
      el.classList.remove("pop");
      void el.getBBox();
      el.classList.add("pop");
    }
  }, 2600);

  function buildAgent(id, startRoom, label) {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "agent");
    g.setAttribute("id", id);

    const halo = document.createElementNS(SVG_NS, "circle");
    halo.setAttribute("class", "agent-halo");
    halo.setAttribute("r", "44");
    halo.setAttribute("fill", "#4BABFF");
    g.appendChild(halo);

    const body = document.createElementNS(SVG_NS, "g");
    body.setAttribute("class", "agent-body");

    const disc = document.createElementNS(SVG_NS, "circle");
    disc.setAttribute("r", "22");
    disc.setAttribute("fill", "#1C91FF");
    disc.setAttribute("stroke", "#FFFFFF");
    disc.setAttribute("stroke-width", "4");
    body.appendChild(disc);

    const robot = document.createElementNS(SVG_NS, "path");
    robot.setAttribute(
      "d",
      "M12 14a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8m2-11h3a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h3V2h4zM8 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4m8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4"
    );
    robot.setAttribute("fill", "#FFFFFF");
    robot.setAttribute("transform", "translate(-17.2,-17.2) scale(1.44)");
    body.appendChild(robot);

    g.appendChild(body);

    const hit = document.createElementNS(SVG_NS, "circle");
    hit.setAttribute("r", "56");
    hit.setAttribute("fill", "transparent");
    hit.setAttribute("class", "agent-hit");
    g.appendChild(hit);

    const tag = document.createElementNS(SVG_NS, "g");
    tag.setAttribute("class", "agent-tag");
    tag.setAttribute("transform", "translate(0,-44)");
    const tagBg = document.createElementNS(SVG_NS, "rect");
    const idleW = 16 + label.length * 12.4;
    tagBg.setAttribute("x", String(-idleW / 2));
    tagBg.setAttribute("y", "-20");
    tagBg.setAttribute("width", String(idleW));
    tagBg.setAttribute("height", "32");
    tagBg.setAttribute("rx", "16");
    tag.appendChild(tagBg);
    const txt = document.createElementNS(SVG_NS, "text");
    txt.setAttribute("text-anchor", "middle");
    txt.setAttribute("y", "3");
    tag.appendChild(txt);
    g.appendChild(tag);

    g._agentTag = tag;
    g._tagBg = tagBg;
    g._tagTxt = txt;
    g._idleLabel = label;
    g._idleWidth = idleW;

    const r = rooms[startRoom];
    const rect = r.interior[0];
    const planX = rect.x + rect.w / 2;
    const planY = rect.y + rect.h / 2;
    const [sx, sy] = iso(planX, planY, 22);
    g.style.setProperty("--x", sx + "px");
    g.style.setProperty("--y", sy + "px");
    g._currentRoom = startRoom;
    g._target = { x: planX, y: planY };
    g._planX = planX;
    g._planY = planY;

    return g;
  }

  const agentsLayer = $byId("agents");
  const agentPhrases: Record<string, string[]> = { "@QualBot": [] };
  const agentDefs = [{ id: "a1", start: "office-t", label: "@QualBot" }];
  const agents = agentDefs.map((d) => {
    const el = buildAgent(d.id, d.start, d.label);
    agentsLayer.appendChild(el);
    el._tagTxt.textContent = d.label;
    return { el, def: d };
  });

  function setTagIdle(el) {
    const w = el._idleWidth;
    el._tagBg.setAttribute("x", -w / 2);
    el._tagBg.setAttribute("width", w);
    el._tagBg.setAttribute("y", -20);
    el._tagBg.setAttribute("height", 32);
    while (el._tagTxt.firstChild) {
      el._tagTxt.removeChild(el._tagTxt.firstChild);
    }
    el._tagTxt.removeAttribute("text-anchor");
    el._tagTxt.setAttribute("text-anchor", "middle");
    const ts = document.createElementNS(SVG_NS, "tspan");
    ts.setAttribute("x", "0");
    ts.setAttribute("dy", "3");
    ts.textContent = el._idleLabel;
    el._tagTxt.appendChild(ts);
    el.classList.remove("talking");
  }

  function wrapText(msg, maxChars) {
    const paragraphs = msg.split("\n");
    const lines: string[] = [];
    for (const para of paragraphs) {
      const words = para.split(" ");
      let cur = "";
      for (const w of words) {
        if (!cur.length) {
          cur = w;
          continue;
        }
        if ((cur + " " + w).length <= maxChars) {
          cur += " " + w;
        } else {
          lines.push(cur);
          cur = w;
        }
      }
      if (cur.length) {
        lines.push(cur);
      }
      if (!words.length) {
        lines.push("");
      }
    }
    return lines;
  }

  function _showBubble(agent, explicitMsg?, opts: any = {}) {
    const phrases = agentPhrases[agent.def.label] || ["Working on it…"];
    const msg =
      explicitMsg || phrases[Math.floor(Math.random() * phrases.length)];
    const el = agent.el;
    const rect = el._tagBg;
    const txt = el._tagTxt;

    if (el._bubbleTimer) {
      clearTimeout(el._bubbleTimer);
    }
    if (el._typeTimer) {
      clearInterval(el._typeTimer);
    }

    const maxChars = opts.maxChars || 42;
    const lines = wrapText(msg, maxChars);
    const lineH = 22;
    const padX = 18,
      padTop = 14,
      padBottom = 14;
    const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
    const finalW = Math.max(el._idleWidth, longest * 10.2 + padX * 2);
    const finalH = padTop + lines.length * lineH + padBottom;

    const rectY = -(finalH - 4);
    rect.setAttribute("x", -finalW / 2);
    rect.setAttribute("width", finalW);
    rect.setAttribute("y", rectY);
    rect.setAttribute("height", finalH);
    rect.setAttribute("rx", 14);

    while (txt.firstChild) {
      txt.removeChild(txt.firstChild);
    }
    const firstY = rectY + padTop + 16;
    const tspans = lines.map((_, i) => {
      const ts = document.createElementNS(SVG_NS, "tspan");
      ts.setAttribute("x", "0");
      ts.setAttribute("text-anchor", "middle");
      if (i === 0) {
        ts.setAttribute("y", String(firstY));
      } else {
        ts.setAttribute("dy", lineH + "");
      }
      txt.appendChild(ts);
      return ts;
    });
    const caret = document.createElementNS(SVG_NS, "tspan");
    caret.setAttribute("class", "caret");
    caret.textContent = "▂";
    el.classList.add("talking");
    el._bubbleSize = { w: finalW, h: finalH };

    return new Promise<void>((resolve) => {
      let lineIdx = 0;
      let charIdx = 0;
      const typeStep = () => {
        if (lineIdx >= lines.length) {
          clearInterval(el._typeTimer);
          if (caret.parentNode) {
            caret.parentNode.removeChild(caret);
          }
          if (opts.hold) {
            resolve();
            return;
          }
          el._bubbleTimer = trackedSetTimeout(() => {
            setTagIdle(el);
            resolve();
          }, opts.holdMs || 1800);
          return;
        }
        const target = lines[lineIdx];
        if (charIdx < target.length) {
          charIdx++;
          tspans[lineIdx].textContent = target.slice(0, charIdx);
          if (caret.parentNode) {
            caret.parentNode.removeChild(caret);
          }
          tspans[lineIdx].appendChild(caret);
        } else {
          lineIdx++;
          charIdx = 0;
        }
      };
      el._typeTimer = trackedSetInterval(typeStep, 22 + Math.random() * 14);
    });
  }

  function _randomSpotIn(roomKey) {
    const r = rooms[roomKey] as any;
    const x = (r.x || 0) + 60 + Math.random() * ((r.w || 320) - 120);
    const y = (r.y || 0) + 90 + Math.random() * ((r.h || 320) - 130);
    return { x, y };
  }

  let moveAgent: any = function moveAgentImpl(agent, targetRoom) {
    return new Promise<void>((resolveMove) => {
      const fromRoom = agent.el._currentRoom;
      const keys = Object.keys(rooms).filter((k) => k !== fromRoom);
      let explicitPoint: { x: number; y: number } | null = null;
      let toRoomKey;
      if (targetRoom && typeof targetRoom === "object") {
        toRoomKey = targetRoom.room;
        explicitPoint = { x: targetRoom.x, y: targetRoom.y };
      } else {
        toRoomKey =
          targetRoom && targetRoom !== fromRoom
            ? targetRoom
            : keys[Math.floor(Math.random() * keys.length)];
      }
      const toRoom = toRoomKey;
      const from = rooms[fromRoom];
      const to = rooms[toRoom];
      const fromDoor = from.door;
      const toDoor = to.door;
      const destRects = to.interior;
      const destRect = destRects[Math.floor(Math.random() * destRects.length)];
      const dest = explicitPoint || {
        x: destRect.x + 40 + Math.random() * (destRect.w - 80),
        y: destRect.y + 40 + Math.random() * (destRect.h - 80),
      };
      const flash = (id) => {
        const l = $byId(id);
        if (!l) {
          return;
        }
        l.classList.remove("flash");
        void (l as any).getBoundingClientRect?.();
        l.classList.add("flash");
      };
      const setRoomActive = (room, active) => {
        const grp = $byId("room-" + room);
        if (!grp) {
          return;
        }
        grp.querySelector(".room-rect")?.classList.toggle("active", active);
        grp.querySelector(".room-glow")?.classList.toggle("active", active);
      };

      const jitter = (base, amt) => base + (Math.random() * 2 - 1) * amt;
      const waypoints: { x: number; y: number }[] = [];
      waypoints.push({ x: fromDoor.x, y: fromDoor.y });

      const fromY = jitter(RAIL_Y, 6);
      const toY = jitter(RAIL_Y, 6);
      waypoints.push({ x: jitter(fromDoor.x, 6), y: fromY });

      const midX = (fromDoor.x + toDoor.x) / 2;
      waypoints.push({ x: jitter(midX, 30), y: jitter(RAIL_Y, 8) });
      waypoints.push({ x: jitter(toDoor.x, 6), y: toY });
      waypoints.push({ x: toDoor.x, y: toDoor.y });
      waypoints.push({ x: dest.x, y: dest.y });

      agent.el.classList.remove("working");
      setRoomActive(fromRoom, false);
      flash(from.lightId);
      if (agent.el._popTimer) {
        clearTimeout(agent.el._popTimer);
      }
      if (agent.el._bubbleTimer) {
        clearTimeout(agent.el._bubbleTimer);
      }
      if (agent.el._typeTimer) {
        clearInterval(agent.el._typeTimer);
      }
      setTagIdle(agent.el);

      const pts = waypoints;
      const segs: any[] = [];
      for (let k = 0; k < pts.length - 1; k++) {
        const p0 = pts[Math.max(0, k - 1)];
        const p1 = pts[k];
        const p2 = pts[k + 1];
        const p3 = pts[Math.min(pts.length - 1, k + 2)];
        const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
        const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        segs.push({ p1, c1, c2, p2, len });
      }
      const totalLen = segs.reduce((s, x) => s + x.len, 0);
      const duration = Math.max(3200, Math.min(10000, (totalLen / 90) * 1000));

      const cumLen: number[] = [0];
      for (const s of segs) {
        cumLen.push(cumLen[cumLen.length - 1] + s.len);
      }
      const triggers = pts.map((_, idx) => cumLen[idx] / totalLen);
      let nextTrig = 1;

      const bez = (t, s) => {
        const mt = 1 - t;
        const x =
          mt * mt * mt * s.p1.x +
          3 * mt * mt * t * s.c1.x +
          3 * mt * t * t * s.c2.x +
          t * t * t * s.p2.x;
        const y =
          mt * mt * mt * s.p1.y +
          3 * mt * mt * t * s.c1.y +
          3 * mt * t * t * s.c2.y +
          t * t * t * s.p2.y;
        return { x, y };
      };
      const easeInOut = (u) =>
        u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;

      const start = performance.now();
      const tick = (now) => {
        if (disposed) {
          return;
        }
        const u = Math.min(1, (now - start) / duration);
        const eu = easeInOut(u);
        const target = eu * totalLen;
        let idx = 0,
          acc = 0;
        while (idx < segs.length - 1 && acc + segs[idx].len < target) {
          acc += segs[idx].len;
          idx++;
        }
        const local = segs[idx].len ? (target - acc) / segs[idx].len : 1;
        const pt = bez(local, segs[idx]);
        agent.el.style.setProperty("--x", pt.x + "px");
        agent.el.style.setProperty("--y", pt.y + "px");
        agent.el._planX = pt.x;
        agent.el._planY = pt.y;

        while (nextTrig < triggers.length && eu >= triggers[nextTrig]) {
          nextTrig++;
        }

        if (u < 1) {
          agent.el._raf = trackedRAF(tick);
        } else {
          agent.el._currentRoom = toRoom;
          agent.el.classList.add("working");
          setRoomActive(toRoom, true);
          flash(to.lightId);
          resolveMove();
        }
      };
      if (agent.el._raf) {
        cancelAnimationFrame(agent.el._raf);
      }
      agent.el._raf = trackedRAF(tick);
    });
  };

  const sleep = (ms: number) =>
    new Promise<void>((r) => trackedSetTimeout(() => r(), ms));

  function showChatCard(hostEl, msg, opts: any = {}) {
    return new Promise<void>((resolve) => {
      const existing = hostEl.querySelector(".chat-card-fo");
      if (existing) {
        existing.remove();
      }

      const isAgent = !!opts.isAgent;
      const maxChars = opts.maxChars || 38;
      const lines = msg.split("\n");
      const longest = lines.reduce(
        (m, l) => Math.max(m, l.replace(/\*\*/g, "").length),
        0
      );
      const cardW = Math.max(360, Math.min(560, longest * 10 + 80));
      const bodyLines =
        Math.max(1, Math.ceil(msg.length / (maxChars * 1.2))) +
        (msg.match(/\n/g) || []).length;
      const cardH = 120 + bodyLines * 28 + 60;

      const fo = document.createElementNS(SVG_NS, "foreignObject");
      fo.setAttribute("class", "chat-card-fo");
      fo.setAttribute("x", String(-cardW / 2));
      const foBottom = -24;
      const foTop = foBottom - cardH;
      fo.setAttribute("y", String(foTop));
      fo.setAttribute("width", String(cardW));
      fo.setAttribute("height", String(cardH));
      fo.setAttribute("overflow", "visible");

      const wrap = document.createElement("div");
      wrap.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
      wrap.style.cssText =
        "width:100%;height:100%;pointer-events:none;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;";
      fo.appendChild(wrap);

      const card = document.createElement("div");
      card.className = "chat-card" + (isAgent ? " agent-card" : "");
      card.style.width = "100%";
      wrap.appendChild(card);

      const header = document.createElement("div");
      header.className = "chat-card-header";
      card.appendChild(header);

      const avatar = document.createElement("div");
      avatar.className = "chat-card-avatar" + (isAgent ? " agent-avatar" : "");
      if (isAgent) {
        avatar.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><circle cx="9" cy="13" r="1.2" fill="white" stroke="none"/><circle cx="15" cy="13" r="1.2" fill="white" stroke="none"/><path d="M12 4v3"/><circle cx="12" cy="3.4" r="1" fill="white" stroke="none"/></svg>';
      } else if (opts.avatar) {
        avatar.style.backgroundImage = `url("${opts.avatar}")`;
      }
      header.appendChild(avatar);

      const meta = document.createElement("div");
      meta.className = "chat-card-meta";
      const nameEl = document.createElement("div");
      nameEl.className = "chat-card-name";
      nameEl.textContent = opts.name || "";
      meta.appendChild(nameEl);
      const roleEl = document.createElement("div");
      roleEl.className = "chat-card-role";
      roleEl.innerHTML = `${opts.role || ""}<span class="dot">·</span>just now`;
      meta.appendChild(roleEl);
      header.appendChild(meta);

      const body = document.createElement("div");
      body.className = "chat-card-body";
      card.appendChild(body);

      const rx = document.createElement("div");
      rx.className = "chat-card-reactions";
      card.appendChild(rx);

      hostEl.appendChild(fo);
      card.style.transformOrigin = "50% 100%";
      try {
        card.animate(
          [
            { opacity: 0, transform: "scale(0.2)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          {
            duration: 420,
            easing: "cubic-bezier(.2,.9,.3,1)",
            fill: "forwards",
          } as KeyframeAnimationOptions
        );
      } catch (_e) {
        /* noop */
      }

      hostEl._chatCard = { card, reactions: rx, fo };

      const tokens = parseRichMessage(msg);
      let tokIdx = 0,
        charIdx = 0;
      let curTextNode: Text | null = null;
      let curLine: HTMLElement = body;
      const caret = document.createElement("span");
      caret.className = "chat-card-caret";

      function beginLine(token) {
        if (token.isBullet) {
          let ul = body.querySelector("ul");
          if (!ul || (body.lastChild as HTMLElement).tagName !== "UL") {
            ul = document.createElement("ul");
            body.appendChild(ul);
          }
          const li = document.createElement("li");
          ul.appendChild(li);
          curLine = li;
        } else if (token.isCloser) {
          const p = document.createElement("div");
          p.className = "closer";
          body.appendChild(p);
          curLine = p;
        } else {
          const p = document.createElement("div");
          p.className = "line";
          body.appendChild(p);
          curLine = p;
        }
      }

      function writeSpan(token) {
        let el;
        if (token.kind === "mention") {
          el = document.createElement("span");
          el.className =
            "mention" +
            (token.text.toLowerCase().includes("qualbot")
              ? " agent-mention"
              : "");
        } else if (token.kind === "bold") {
          el = document.createElement("strong");
        } else {
          el = document.createElement("span");
        }
        curLine.appendChild(el);
        const tn = document.createTextNode("");
        el.appendChild(tn);
        return tn;
      }

      beginLine(tokens[0] || { kind: "text", text: "" });
      curLine.appendChild(caret);

      const typeTimer = trackedSetInterval(
        () => {
          if (tokIdx >= tokens.length) {
            clearInterval(typeTimer);
            if (caret.parentNode) {
              caret.parentNode.removeChild(caret);
            }
            trackedSetTimeout(() => {
              let fadeAnim;
              try {
                fadeAnim = card.animate(
                  [
                    { opacity: 1, transform: "scale(1)" },
                    { opacity: 0, transform: "scale(0.2)" },
                  ],
                  {
                    duration: 280,
                    easing: "cubic-bezier(.4,0,.6,1)",
                    fill: "forwards",
                  } as KeyframeAnimationOptions
                );
              } catch (_e) {
                /* noop */
              }
              const done = () => {
                fo.remove();
                hostEl._chatCard = null;
                resolve();
              };
              if (fadeAnim) {
                fadeAnim.onfinish = done;
              } else {
                trackedSetTimeout(done, 260);
              }
            }, opts.holdMs || 2200);
            return;
          }
          const tok = tokens[tokIdx];
          if (tok.kind === "newline") {
            tokIdx++;
            charIdx = 0;
            curTextNode = null;
            const next = tokens[tokIdx];
            if (next) {
              beginLine(next);
            }
            if (caret.parentNode) {
              caret.parentNode.removeChild(caret);
            }
            curLine.appendChild(caret);
            return;
          }
          if (!curTextNode) {
            curTextNode = writeSpan(tok);
            if (caret.parentNode) {
              caret.parentNode.removeChild(caret);
            }
            curLine.appendChild(caret);
          }
          if (charIdx < tok.text.length) {
            charIdx++;
            if (curTextNode) {
              curTextNode.data = tok.text.slice(0, charIdx);
            }
            if (caret.parentNode) {
              caret.parentNode.removeChild(caret);
            }
            curLine.appendChild(caret);
          } else {
            tokIdx++;
            charIdx = 0;
            curTextNode = null;
          }
        },
        18 + Math.random() * 10
      );
    });
  }

  function parseRichMessage(msg) {
    const tokens: any[] = [];
    const lines = msg.split("\n");
    lines.forEach((line, li) => {
      let isBullet = false;
      let isCloser = false;
      if (line.startsWith("* ")) {
        isBullet = true;
        line = line.slice(2);
      } else if (line.startsWith("> ")) {
        isCloser = true;
        line = line.slice(2);
      }
      let lineStart = true;
      const re = /(\*\*[^*]+\*\*|@[A-Za-z][A-Za-z0-9_]*)/g;
      let lastIdx = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        if (m.index > lastIdx) {
          tokens.push({
            kind: "text",
            text: line.slice(lastIdx, m.index),
            isBullet: lineStart && isBullet,
            isCloser: lineStart && isCloser,
          });
          lineStart = false;
        }
        const tk = m[0];
        if (tk.startsWith("**")) {
          tokens.push({
            kind: "bold",
            text: tk.slice(2, -2),
            isBullet: lineStart && isBullet,
            isCloser: lineStart && isCloser,
          });
        } else {
          tokens.push({
            kind: "mention",
            text: tk,
            isBullet: lineStart && isBullet,
            isCloser: lineStart && isCloser,
          });
        }
        lineStart = false;
        lastIdx = re.lastIndex;
      }
      if (lastIdx < line.length) {
        tokens.push({
          kind: "text",
          text: line.slice(lastIdx),
          isBullet: lineStart && isBullet,
          isCloser: lineStart && isCloser,
        });
      } else if (lastIdx === 0 && line.length === 0) {
        tokens.push({
          kind: "text",
          text: "",
          isBullet: lineStart && isBullet,
          isCloser: lineStart && isCloser,
        });
      }
      if (li < lines.length - 1) {
        tokens.push({ kind: "newline" });
      }
    });
    return tokens;
  }

  function pickPersonIn(roomKey, skipSet) {
    const candidates = Array.from(
      humansLayer.querySelectorAll(".human")
    ).filter((p: any) => p._roomKey === roomKey && !skipSet.has(p));
    return (candidates[0] as any) || null;
  }

  const skip = new Set();
  const lisa = pickPersonIn("office-d", skip);
  if (lisa) {
    skip.add(lisa);
  }
  const marco = pickPersonIn("office-t", skip);
  if (marco) {
    skip.add(marco);
  }
  const yuki = pickPersonIn("office-c", skip);
  if (yuki) {
    skip.add(yuki);
  }
  if (lisa) {
    lisa.dataset.person = "lisa";
  }
  if (marco) {
    marco.dataset.person = "marco";
  }
  if (yuki) {
    yuki.dataset.person = "yuki";
  }

  function avatarUrlOf(personEl) {
    const img = personEl.querySelector("image");
    return img
      ? img.getAttribute("href") ||
          img.getAttributeNS("http://www.w3.org/1999/xlink", "href")
      : null;
  }
  if (lisa) {
    lisa._chatMeta = {
      name: "Lisa Okafor",
      role: "RevOps Lead",
      avatar: avatarUrlOf(lisa),
    };
  }
  if (marco) {
    marco._chatMeta = {
      name: "Marco Alves",
      role: "AE · Sales",
      avatar: avatarUrlOf(marco),
    };
  }
  if (yuki) {
    yuki._chatMeta = {
      name: "Yuki Tanaka",
      role: "AE · Sales",
      avatar: avatarUrlOf(yuki),
    };
  }

  const qualBot = agents[0];

  function chatCardFor(targetEl) {
    return targetEl._chatCard || null;
  }
  function bubbleAnchorFor(targetEl) {
    const cc = chatCardFor(targetEl);
    if (cc) {
      const r = cc.card.getBoundingClientRect();
      return { x: r.left + r.width * 0.25, y: r.bottom - 18 };
    }
    const r = targetEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top };
  }

  function addReactionPill(targetEl, emoji, isAgent) {
    const cc = chatCardFor(targetEl);
    if (!cc) {
      return null;
    }
    const existing = cc.reactions.querySelector(
      `.react-pill[data-em="${emoji}"]`
    );
    if (existing) {
      const countEl = existing.querySelector(".count") as HTMLElement;
      const n = (parseInt(countEl.textContent || "1", 10) || 1) + 1;
      countEl.textContent = String(n);
      existing.style.animation = "none";
      existing.offsetHeight;
      existing.style.animation = "";
      return existing;
    }
    const pill = document.createElement("span");
    pill.className = "react-pill";
    pill.dataset.em = emoji;
    pill.innerHTML = `<span class="em">${emoji}</span><span class="count">1</span>`;
    cc.reactions.appendChild(pill);
    return pill;
  }

  function flyReaction(reactorEl, targetEl, emoji, isAgent) {
    const from = reactorEl.getBoundingClientRect();
    const to = bubbleAnchorFor(targetEl);
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;

    const fly = document.createElement("div");
    fly.className = "dust-floor-fly-emoji";
    fly.textContent = emoji;
    fly.style.left = fx + "px";
    fly.style.top = fy + "px";
    fly.style.opacity = "0";
    document.body.appendChild(fly);
    flyNodes.add(fly);

    const peakX = (fx + to.x) / 2;
    const peakY = Math.min(fy, to.y) - 60;

    const anim = fly.animate(
      [
        {
          left: fx + "px",
          top: fy + "px",
          opacity: 0,
          transform: "translate(-50%,-50%) scale(0.3)",
        },
        {
          opacity: 1,
          transform: "translate(-50%,-50%) scale(1.25)",
          offset: 0.2,
        },
        {
          left: peakX + "px",
          top: peakY + "px",
          transform: "translate(-50%,-50%) scale(1.1)",
          offset: 0.55,
        },
        {
          left: to.x + "px",
          top: to.y + "px",
          opacity: 1,
          transform: "translate(-50%,-50%) scale(0.75)",
        },
      ],
      {
        duration: 850,
        easing: "cubic-bezier(.4,0,.2,1)",
        fill: "forwards",
      } as KeyframeAnimationOptions
    );

    anim.onfinish = () => {
      flyNodes.delete(fly);
      fly.remove();
      addReactionPill(targetEl, emoji, isAgent);
    };
  }

  function scheduleReactions(
    targetEl,
    reactions,
    baseDelayMs = 0,
    isAgent = false
  ) {
    for (const r of reactions) {
      trackedSetTimeout(
        () => {
          const reactor = ({ lisa, marco, yuki } as any)[r.from];
          if (!reactor) {
            return;
          }
          flyReaction(reactor, targetEl, r.emoji, isAgent);
        },
        baseDelayMs + (r.at || 0)
      );
    }
  }

  function showAgentCard(agent, msg, opts: any = {}) {
    return showChatCard(agent.el, msg, {
      holdMs: opts.holdMs,
      maxChars: opts.maxChars,
      name: "QualBot",
      role: "Agent · Sales",
      isAgent: true,
    });
  }

  async function runScenario1() {
    if (!lisa || !marco || !yuki) {
      return;
    }
    if (disposed) {
      return;
    }

    const qb = qualBot.el;
    const qbHome = { x: qb._planX, y: qb._planY };

    function walkAgentTo(agent, tx, ty) {
      return new Promise<void>((resolve) => {
        const el = agent.el;
        if (el._raf) {
          cancelAnimationFrame(el._raf);
        }
        const sx = el._planX;
        const sy = el._planY;
        const dist = Math.hypot(tx - sx, ty - sy);
        if (dist < 4) {
          resolve();
          return;
        }
        const duration = Math.max(900, Math.min(2800, (dist / 90) * 1000));
        const easeInOut = (u) =>
          u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const start = performance.now();
        el.classList.remove("working");
        const tick = (now) => {
          if (disposed) {
            return;
          }
          const u = Math.min(1, (now - start) / duration);
          const eu = easeInOut(u);
          const x = sx + (tx - sx) * eu;
          const y = sy + (ty - sy) * eu;
          const [ix, iy] = iso(x, y, 22);
          el.style.setProperty("--x", ix + "px");
          el.style.setProperty("--y", iy + "px");
          el._planX = x;
          el._planY = y;
          if (u < 1) {
            el._raf = trackedRAF(tick);
          } else {
            el.classList.add("working");
            resolve();
          }
        };
        el._raf = trackedRAF(tick);
      });
    }

    {
      const p = showChatCard(
        lisa,
        "Just shipped v2 of @QualBot. It now pulls live usage data from Snowflake and cross-references with our ICP scoring in HubSpot. Let me know if anything feels off.",
        {
          holdMs: 5200,
          name: lisa._chatMeta.name,
          role: lisa._chatMeta.role,
          avatar: lisa._chatMeta.avatar,
        }
      );
      scheduleReactions(lisa, [
        { from: "marco", emoji: "👍", at: 3600 },
        { from: "yuki", emoji: "🚀", at: 4400 },
        { from: "marco", emoji: "👀", at: 5100 },
      ]);
      await p;
      await sleep(400);
    }

    {
      const p = showChatCard(
        marco,
        "@Lisa nice! Does it handle multi-product accounts now? We kept getting weird scores for companies on both plans.",
        {
          holdMs: 4200,
          name: marco._chatMeta.name,
          role: marco._chatMeta.role,
          avatar: marco._chatMeta.avatar,
        }
      );
      await p;
      await sleep(300);
    }

    {
      const p = showChatCard(
        lisa,
        "Yep, fixed. It now scores **per product line** and rolls up into a composite. Try it on one of your accounts and tell me if the output makes sense.",
        {
          holdMs: 4600,
          name: lisa._chatMeta.name,
          role: lisa._chatMeta.role,
          avatar: lisa._chatMeta.avatar,
        }
      );
      scheduleReactions(lisa, [{ from: "marco", emoji: "✅", at: 3200 }]);
      await p;
      await sleep(400);
    }

    {
      const p = showChatCard(
        marco,
        "@QualBot can you qualify Meridian Health? They just booked a demo for Thursday.",
        {
          holdMs: 3600,
          name: marco._chatMeta.name,
          role: marco._chatMeta.role,
          avatar: marco._chatMeta.avatar,
        }
      );
      await p;
      await sleep(300);
    }

    {
      const mx = marco._planX,
        my = marco._planY;
      const offX = 60,
        offY = -10;
      await walkAgentTo(qualBot, mx + offX, my + offY);
    }

    {
      const msg = [
        "Here's what I found on **Meridian Health**:",
        "* **ICP score:** 87/100 — mid-market healthcare, 340 employees.",
        "* **Intent:** pricing page 6× this month, downloaded security whitepaper.",
        "* **Usage:** trial with 14 active users, 3 agents built. Top agent: compliance FAQ bot.",
        "* **Champion:** likely Priya Nair (Head of IT Ops) — built 2 of the 3 agents.",
        "* **Risk:** no executive sponsor identified yet.",
        "> Strong fit. Suggest looping in Priya's VP before the demo. Draft a pre-meeting brief?",
      ].join("\n");
      const p = showAgentCard(qualBot, msg, { holdMs: 7200, maxChars: 46 });
      scheduleReactions(
        qualBot.el,
        [
          { from: "marco", emoji: "🔥", at: 5200 },
          { from: "yuki", emoji: "🎯", at: 6000 },
          { from: "lisa", emoji: "🔥", at: 6700 },
        ],
        0,
        true
      );
      await p;
      await sleep(400);
    }

    {
      const p = showChatCard(
        marco,
        "Yes please. And flag this in #sales-pipeline.",
        {
          holdMs: 3000,
          name: marco._chatMeta.name,
          role: marco._chatMeta.role,
          avatar: marco._chatMeta.avatar,
        }
      );
      await p;
      await sleep(300);
    }

    {
      const p = showAgentCard(
        qualBot,
        "Done. Brief posted to the Meridian Health project. Flagged in #sales-pipeline with summary.",
        { holdMs: 3800 }
      );
      await p;
      await sleep(400);
    }

    {
      const p = showChatCard(
        yuki,
        "@Marco I worked with Meridian's VP of Ops at my last company. Happy to make a warm intro if that helps.",
        {
          holdMs: 4400,
          name: yuki._chatMeta.name,
          role: yuki._chatMeta.role,
          avatar: yuki._chatMeta.avatar,
        }
      );
      scheduleReactions(yuki, [
        { from: "marco", emoji: "❤️", at: 3000 },
        { from: "lisa", emoji: "❤️", at: 3700 },
      ]);
      await p;
      await sleep(400);
    }

    {
      const p = showChatCard(
        marco,
        "@Yuki that would be incredible, yes please. I'll send you the brief @QualBot just put together so you have context.",
        {
          holdMs: 4400,
          name: marco._chatMeta.name,
          role: marco._chatMeta.role,
          avatar: marco._chatMeta.avatar,
        }
      );
      await p;
      await sleep(300);
    }

    {
      const p = showChatCard(
        lisa,
        "This is exactly the workflow I was hoping for. Agent does the research, humans do the relationships. 🤝",
        {
          holdMs: 5000,
          name: lisa._chatMeta.name,
          role: lisa._chatMeta.role,
          avatar: lisa._chatMeta.avatar,
        }
      );
      scheduleReactions(lisa, [
        { from: "marco", emoji: "💯", at: 3000 },
        { from: "yuki", emoji: "💯", at: 3700 },
        { from: "marco", emoji: "🤝", at: 4400 },
      ]);
      await p;
      await sleep(800);
    }

    walkAgentTo(qualBot, qbHome.x, qbHome.y);
    await sleep(600);
  }

  // Place every agent in its home room, idle.
  agents.forEach((a) => {
    const grp = $byId("room-" + a.el._currentRoom);
    if (grp) {
      grp.querySelector(".room-rect")?.classList.add("active");
      grp.querySelector(".room-glow")?.classList.add("active");
    }
    a.el.classList.add("working");
  });

  (async function conductor() {
    await sleep(1200);
    while (!disposed) {
      await runScenario1();
      if (disposed) {
        break;
      }
      await sleep(2500);
    }
  })();

  // ----- Drag-to-move -----
  const svg = $byId("plan") as SVGSVGElement;

  function toSvgPoint(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  }
  function roomAt(x, y) {
    for (const [key, r] of Object.entries(rooms) as [string, any][]) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        return key;
      }
    }
    return null;
  }
  function startDrag(agent, clientX, clientY) {
    const el = agent.el;
    const p = toSvgPoint(clientX, clientY);
    const curX = parseFloat(el.style.getPropertyValue("--x")) || 0;
    const curY = parseFloat(el.style.getPropertyValue("--y")) || 0;
    el._dragOff = { dx: curX - p.x, dy: curY - p.y };

    if (el._raf) {
      cancelAnimationFrame(el._raf);
    }
    if (el._moveTimer) {
      clearTimeout(el._moveTimer);
    }
    if (el._popTimer) {
      clearTimeout(el._popTimer);
    }
    if (el._bubbleTimer) {
      clearTimeout(el._bubbleTimer);
    }
    if (el._typeTimer) {
      clearInterval(el._typeTimer);
    }
    setTagIdle(el);

    if (el._currentRoom) {
      const grp = $byId("room-" + el._currentRoom);
      if (grp) {
        grp.querySelector(".room-rect")?.classList.remove("active");
        grp.querySelector(".room-glow")?.classList.remove("active");
      }
    }
    el._dragging = true;
    el.classList.add("dragging");
    el.classList.remove("working");
    el.parentNode.appendChild(el);
  }
  function onDragMove(agent, clientX, clientY) {
    if (!agent.el._dragging) {
      return;
    }
    const p = toSvgPoint(clientX, clientY);
    const { dx, dy } = agent.el._dragOff;
    agent.el.style.setProperty("--x", p.x + dx + "px");
    agent.el.style.setProperty("--y", p.y + dy + "px");
  }
  function endDrag(agent) {
    const el = agent.el;
    if (!el._dragging) {
      return;
    }
    el._dragging = false;
    el.classList.remove("dragging");

    const x = parseFloat(el.style.getPropertyValue("--x")) || 0;
    const y = parseFloat(el.style.getPropertyValue("--y")) || 0;
    const room = roomAt(x, y);
    if (room) {
      el._currentRoom = room;
      el.classList.add("working");
      const grp = $byId("room-" + room);
      if (grp) {
        grp.querySelector(".room-rect")?.classList.add("active");
        grp.querySelector(".room-glow")?.classList.add("active");
      }
      const light = $byId(rooms[room].lightId);
      if (light) {
        light.classList.remove("flash");
        void (light as any).getBoundingClientRect?.();
        light.classList.add("flash");
      }
    } else {
      el._currentRoom = el._currentRoom || Object.keys(rooms)[0];
      el._moveTimer = trackedSetTimeout(
        () => moveAgent(agent, agent.def.start),
        1400
      );
    }
  }

  let activeDrag: any = null;
  agents.forEach((agent) => {
    const el = agent.el;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      activeDrag = { agent, pointerId: ev.pointerId };
      startDrag(agent, ev.clientX, ev.clientY);
    });
  });
  trackedWindowOn("pointermove", (ev: any) => {
    if (!activeDrag) {
      return;
    }
    onDragMove(activeDrag.agent, ev.clientX, ev.clientY);
  });
  const finishDrag = () => {
    if (!activeDrag) {
      return;
    }
    const { agent } = activeDrag;
    activeDrag = null;
    endDrag(agent);
  };
  trackedWindowOn("pointerup", finishDrag);
  trackedWindowOn("pointercancel", finishDrag);

  const _origMoveAgent = moveAgent;
  moveAgent = function (agent, targetRoom) {
    if (agent.el._dragging) {
      return Promise.resolve();
    }
    return _origMoveAgent(agent, targetRoom);
  };

  // ===========================================================================
  // Cleanup
  // ===========================================================================
  return () => {
    disposed = true;
    rafs.forEach((id) => cancelAnimationFrame(id));
    intervals.forEach((id) => clearInterval(id));
    timeouts.forEach((id) => clearTimeout(id));
    rafs.clear();
    intervals.clear();
    timeouts.clear();
    winListeners.forEach(([type, fn]) => window.removeEventListener(type, fn));
    flyNodes.forEach((node) => node.remove());
    flyNodes.clear();
    host.innerHTML = "";
    if (injectedStyle && styleEl && styleEl.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
    }
  };
}
