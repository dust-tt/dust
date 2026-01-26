import EventEmitter from "eventemitter3";
import { Disposable } from "../helpers/disposable";
export interface SashOptions {
    /** Whether a sash is horizontal or vertical. */
    readonly orientation: Orientation;
    /** The width or height of a vertical or horizontal sash, respectively. */
    readonly size?: number;
}
export interface SashEvent {
    startX: number;
    currentX: number;
    startY: number;
    currentY: number;
}
export declare enum Orientation {
    Vertical = "VERTICAL",
    Horizontal = "HORIZONTAL"
}
export declare enum SashState {
    /** Disable any UI interaction. */
    Disabled = "DISABLED",
    /**
     * Allow dragging down or to the right, depending on the sash orientation.
     *
     * Some OSs allow customizing the mouse cursor differently whenever
     * some resizable component can't be any smaller, but can be larger.
     */
    Minimum = "MINIMUM",
    /**
     * Allow dragging up or to the left, depending on the sash orientation.
     *
     * Some OSs allow customizing the mouse cursor differently whenever
     * some resizable component can't be any larger, but can be smaller.
     */
    Maximum = "MAXIMUM",
    /** Enable dragging. */
    Enabled = "ENABLED"
}
export declare function setGlobalSashSize(size: number): void;
export interface SashLayoutProvider {
}
/** A vertical sash layout provider provides position and height for a sash. */
export interface VerticalSashLayoutProvider extends SashLayoutProvider {
    getVerticalSashLeft(sash: Sash): number;
    getVerticalSashTop?(sash: Sash): number;
    getVerticalSashHeight?(sash: Sash): number;
}
/** A horizontal sash layout provider provides position and width for a sash. */
export interface HorizontalSashLayoutProvider extends SashLayoutProvider {
    getHorizontalSashTop(sash: Sash): number;
    getHorizontalSashLeft?(sash: Sash): number;
    getHorizontalSashWidth?(sash: Sash): number;
}
/**
 * The {@link Sash} is the UI component which allows the user to resize other
 * components. It's usually an invisible horizontal or vertical line which, when
 * hovered, becomes highlighted and can be dragged along the perpendicular dimension
 * to its direction.
 */
export declare class Sash extends EventEmitter implements Disposable {
    private el;
    private layoutProvider;
    private orientation;
    private size;
    private hoverDelay;
    private hoverDelayer;
    private _state;
    get state(): SashState;
    /**
     * The state of a sash defines whether it can be interacted with by the user
     * as well as what mouse cursor to use, when hovered.
     */
    set state(state: SashState);
    /**
     * Create a new vertical sash.
     *
     * @param container A DOM node to append the sash to.
     * @param verticalLayoutProvider A vertical layout provider.
     * @param options The options.
     */
    constructor(container: HTMLElement, layoutProvider: VerticalSashLayoutProvider, options: SashOptions);
    /**
     * Create a new horizontal sash.
     *
     * @param container A DOM node to append the sash to.
     * @param horizontalLayoutProvider A horizontal layout provider.
     * @param options The options.
     */
    constructor(container: HTMLElement, layoutProvider: HorizontalSashLayoutProvider, options: SashOptions);
    private onPointerStart;
    private onPointerDoublePress;
    private onMouseEnter;
    private onMouseLeave;
    /**
     * Layout the sash. The sash will size and position itself
     * based on its provided {@link SashLayoutProvider layout provider}.
     */
    layout(): void;
    dispose(): void;
}
//# sourceMappingURL=sash.d.ts.map