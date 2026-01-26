import { LayoutService } from "../layout-service";
import { LayoutPriority, View } from "../split-view";
export interface Layout {
    getPreferredSize: () => number | undefined;
}
export declare class PixelLayout implements Layout {
    private size;
    constructor(size: number);
    getPreferredSize(): number;
}
export declare class ProportionLayout implements Layout {
    private proportion;
    private layoutService;
    constructor(proportion: number, layoutService: LayoutService);
    getPreferredSize(): number;
}
export declare class NullLayout implements Layout {
    getPreferredSize(): undefined;
}
export interface PaneViewOptions {
    element: HTMLElement;
    minimumSize?: number;
    maximumSize?: number;
    priority?: LayoutPriority;
    preferredSize?: number | string;
    snap?: boolean;
}
export declare class PaneView implements View {
    minimumSize: number;
    maximumSize: number;
    readonly element: HTMLElement;
    readonly priority?: LayoutPriority | undefined;
    readonly snap: boolean;
    private layoutService;
    private layoutStrategy;
    get preferredSize(): number | undefined;
    set preferredSize(preferredSize: number | string | undefined);
    constructor(layoutService: LayoutService, options: PaneViewOptions);
    layout(_size: number): void;
}
//# sourceMappingURL=pane-view.d.ts.map