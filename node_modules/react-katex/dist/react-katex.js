(function(global, factory) {
    if (typeof module === "object" && typeof module.exports === "object") factory(exports, require("react"), require("prop-types"), require("katex"));
    else if (typeof define === "function" && define.amd) define([
        "exports",
        "react",
        "prop-types",
        "katex"
    ], factory);
    else if (global = typeof globalThis !== "undefined" ? globalThis : global || self) factory(global.index = {}, global.react, global.propTypes, global.katex);
})(this, function(exports, _react, _propTypes, _katex) {
    "use strict";
    Object.defineProperty(exports, "__esModule", {
        value: true
    });
    function _export(target, all) {
        for(var name in all)Object.defineProperty(target, name, {
            enumerable: true,
            get: all[name]
        });
    }
    _export(exports, {
        BlockMath: ()=>BlockMath,
        InlineMath: ()=>InlineMath
    });
    _react = /*#__PURE__*/ _interopRequireWildcard(_react);
    _propTypes = /*#__PURE__*/ _interopRequireDefault(_propTypes);
    _katex = /*#__PURE__*/ _interopRequireDefault(_katex);
    function _interopRequireDefault(obj) {
        return obj && obj.__esModule ? obj : {
            default: obj
        };
    }
    function _getRequireWildcardCache(nodeInterop) {
        if (typeof WeakMap !== "function") return null;
        var cacheBabelInterop = new WeakMap();
        var cacheNodeInterop = new WeakMap();
        return (_getRequireWildcardCache = function(nodeInterop) {
            return nodeInterop ? cacheNodeInterop : cacheBabelInterop;
        })(nodeInterop);
    }
    function _interopRequireWildcard(obj, nodeInterop) {
        if (!nodeInterop && obj && obj.__esModule) {
            return obj;
        }
        if (obj === null || typeof obj !== "object" && typeof obj !== "function") {
            return {
                default: obj
            };
        }
        var cache = _getRequireWildcardCache(nodeInterop);
        if (cache && cache.has(obj)) {
            return cache.get(obj);
        }
        var newObj = {};
        var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor;
        for(var key in obj){
            if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) {
                var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null;
                if (desc && (desc.get || desc.set)) {
                    Object.defineProperty(newObj, key, desc);
                } else {
                    newObj[key] = obj[key];
                }
            }
        }
        newObj.default = obj;
        if (cache) {
            cache.set(obj, newObj);
        }
        return newObj;
    }
    /**
 * @typedef {import("react").ReactNode} ReactNode
 *
 *
 * @callback ErrorRenderer
 * @param {Error} error
 * @returns {ReactNode}
 *
 *
 * @typedef {object} MathComponentPropsWithMath
 * @property {string} math
 * @property {ReactNode=} children
 * @property {string=} errorColor
 * @property {ErrorRenderer=} renderError
 *
 *
 * @typedef {object} MathComponentPropsWithChildren
 * @property {string=} math
 * @property {ReactNode} children
 * @property {string=} errorColor
 * @property {ErrorRenderer=} renderError
 *
 * @typedef {MathComponentPropsWithMath | MathComponentPropsWithChildren} MathComponentProps
 */ const createMathComponent = (Component, { displayMode  })=>{
        /**
   *
   * @param {MathComponentProps} props
   * @returns {ReactNode}
   */ const MathComponent = ({ children , errorColor , math , renderError  })=>{
            const formula = math !== null && math !== void 0 ? math : children;
            const { html , error  } = (0, _react.useMemo)(()=>{
                try {
                    const html = _katex.default.renderToString(formula, {
                        displayMode,
                        errorColor,
                        throwOnError: !!renderError
                    });
                    return {
                        html,
                        error: undefined
                    };
                } catch (error) {
                    if (error instanceof _katex.default.ParseError || error instanceof TypeError) {
                        return {
                            error
                        };
                    }
                    throw error;
                }
            }, [
                formula,
                errorColor,
                renderError
            ]);
            if (error) {
                return renderError ? renderError(error) : /*#__PURE__*/ _react.default.createElement(Component, {
                    html: `${error.message}`
                });
            }
            return /*#__PURE__*/ _react.default.createElement(Component, {
                html: html
            });
        };
        MathComponent.propTypes = {
            children: _propTypes.default.string,
            errorColor: _propTypes.default.string,
            math: _propTypes.default.string,
            renderError: _propTypes.default.func
        };
        return MathComponent;
    };
    const InternalPathComponentPropTypes = {
        html: _propTypes.default.string.isRequired
    };
    const InternalBlockMath = ({ html  })=>{
        return /*#__PURE__*/ _react.default.createElement("div", {
            "data-testid": "react-katex",
            dangerouslySetInnerHTML: {
                __html: html
            }
        });
    };
    InternalBlockMath.propTypes = InternalPathComponentPropTypes;
    const InternalInlineMath = ({ html  })=>{
        return /*#__PURE__*/ _react.default.createElement("span", {
            "data-testid": "react-katex",
            dangerouslySetInnerHTML: {
                __html: html
            }
        });
    };
    InternalInlineMath.propTypes = InternalPathComponentPropTypes;
    const BlockMath = createMathComponent(InternalBlockMath, {
        displayMode: true
    });
    const InlineMath = createMathComponent(InternalInlineMath, {
        displayMode: false
    });
});

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qc3giXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFJlYWN0LCB7IHVzZU1lbW8gfSBmcm9tICdyZWFjdCc7XG5pbXBvcnQgUHJvcFR5cGVzIGZyb20gJ3Byb3AtdHlwZXMnO1xuaW1wb3J0IEthVGVYIGZyb20gJ2thdGV4JztcblxuLyoqXG4gKiBAdHlwZWRlZiB7aW1wb3J0KFwicmVhY3RcIikuUmVhY3ROb2RlfSBSZWFjdE5vZGVcbiAqXG4gKlxuICogQGNhbGxiYWNrIEVycm9yUmVuZGVyZXJcbiAqIEBwYXJhbSB7RXJyb3J9IGVycm9yXG4gKiBAcmV0dXJucyB7UmVhY3ROb2RlfVxuICpcbiAqXG4gKiBAdHlwZWRlZiB7b2JqZWN0fSBNYXRoQ29tcG9uZW50UHJvcHNXaXRoTWF0aFxuICogQHByb3BlcnR5IHtzdHJpbmd9IG1hdGhcbiAqIEBwcm9wZXJ0eSB7UmVhY3ROb2RlPX0gY2hpbGRyZW5cbiAqIEBwcm9wZXJ0eSB7c3RyaW5nPX0gZXJyb3JDb2xvclxuICogQHByb3BlcnR5IHtFcnJvclJlbmRlcmVyPX0gcmVuZGVyRXJyb3JcbiAqXG4gKlxuICogQHR5cGVkZWYge29iamVjdH0gTWF0aENvbXBvbmVudFByb3BzV2l0aENoaWxkcmVuXG4gKiBAcHJvcGVydHkge3N0cmluZz19IG1hdGhcbiAqIEBwcm9wZXJ0eSB7UmVhY3ROb2RlfSBjaGlsZHJlblxuICogQHByb3BlcnR5IHtzdHJpbmc9fSBlcnJvckNvbG9yXG4gKiBAcHJvcGVydHkge0Vycm9yUmVuZGVyZXI9fSByZW5kZXJFcnJvclxuICpcbiAqIEB0eXBlZGVmIHtNYXRoQ29tcG9uZW50UHJvcHNXaXRoTWF0aCB8IE1hdGhDb21wb25lbnRQcm9wc1dpdGhDaGlsZHJlbn0gTWF0aENvbXBvbmVudFByb3BzXG4gKi9cblxuY29uc3QgY3JlYXRlTWF0aENvbXBvbmVudCA9IChDb21wb25lbnQsIHsgZGlzcGxheU1vZGUgfSkgPT4ge1xuICAvKipcbiAgICpcbiAgICogQHBhcmFtIHtNYXRoQ29tcG9uZW50UHJvcHN9IHByb3BzXG4gICAqIEByZXR1cm5zIHtSZWFjdE5vZGV9XG4gICAqL1xuICBjb25zdCBNYXRoQ29tcG9uZW50ID0gKHsgY2hpbGRyZW4sIGVycm9yQ29sb3IsIG1hdGgsIHJlbmRlckVycm9yIH0pID0+IHtcbiAgICBjb25zdCBmb3JtdWxhID0gbWF0aCA/PyBjaGlsZHJlbjtcblxuICAgIGNvbnN0IHsgaHRtbCwgZXJyb3IgfSA9IHVzZU1lbW8oKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaHRtbCA9IEthVGVYLnJlbmRlclRvU3RyaW5nKGZvcm11bGEsIHtcbiAgICAgICAgICBkaXNwbGF5TW9kZSxcbiAgICAgICAgICBlcnJvckNvbG9yLFxuICAgICAgICAgIHRocm93T25FcnJvcjogISFyZW5kZXJFcnJvcixcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHsgaHRtbCwgZXJyb3I6IHVuZGVmaW5lZCB9O1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgS2FUZVguUGFyc2VFcnJvciB8fCBlcnJvciBpbnN0YW5jZW9mIFR5cGVFcnJvcikge1xuICAgICAgICAgIHJldHVybiB7IGVycm9yIH07XG4gICAgICAgIH1cblxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9LCBbZm9ybXVsYSwgZXJyb3JDb2xvciwgcmVuZGVyRXJyb3JdKTtcblxuICAgIGlmIChlcnJvcikge1xuICAgICAgcmV0dXJuIHJlbmRlckVycm9yID8gcmVuZGVyRXJyb3IoZXJyb3IpIDogPENvbXBvbmVudCBodG1sPXtgJHtlcnJvci5tZXNzYWdlfWB9IC8+O1xuICAgIH1cblxuICAgIHJldHVybiA8Q29tcG9uZW50IGh0bWw9e2h0bWx9IC8+O1xuICB9O1xuXG4gIE1hdGhDb21wb25lbnQucHJvcFR5cGVzID0ge1xuICAgIGNoaWxkcmVuOiBQcm9wVHlwZXMuc3RyaW5nLFxuICAgIGVycm9yQ29sb3I6IFByb3BUeXBlcy5zdHJpbmcsXG4gICAgbWF0aDogUHJvcFR5cGVzLnN0cmluZyxcbiAgICByZW5kZXJFcnJvcjogUHJvcFR5cGVzLmZ1bmMsXG4gIH07XG5cbiAgcmV0dXJuIE1hdGhDb21wb25lbnQ7XG59O1xuXG5jb25zdCBJbnRlcm5hbFBhdGhDb21wb25lbnRQcm9wVHlwZXMgPSB7XG4gIGh0bWw6IFByb3BUeXBlcy5zdHJpbmcuaXNSZXF1aXJlZCxcbn07XG5cbmNvbnN0IEludGVybmFsQmxvY2tNYXRoID0gKHsgaHRtbCB9KSA9PiB7XG4gIHJldHVybiA8ZGl2IGRhdGEtdGVzdGlkPVwicmVhY3Qta2F0ZXhcIiBkYW5nZXJvdXNseVNldElubmVySFRNTD17eyBfX2h0bWw6IGh0bWwgfX0gLz47XG59O1xuXG5JbnRlcm5hbEJsb2NrTWF0aC5wcm9wVHlwZXMgPSBJbnRlcm5hbFBhdGhDb21wb25lbnRQcm9wVHlwZXM7XG5cbmNvbnN0IEludGVybmFsSW5saW5lTWF0aCA9ICh7IGh0bWwgfSkgPT4ge1xuICByZXR1cm4gPHNwYW4gZGF0YS10ZXN0aWQ9XCJyZWFjdC1rYXRleFwiIGRhbmdlcm91c2x5U2V0SW5uZXJIVE1MPXt7IF9faHRtbDogaHRtbCB9fSAvPjtcbn07XG5cbkludGVybmFsSW5saW5lTWF0aC5wcm9wVHlwZXMgPSBJbnRlcm5hbFBhdGhDb21wb25lbnRQcm9wVHlwZXM7XG5cbmV4cG9ydCBjb25zdCBCbG9ja01hdGggPSBjcmVhdGVNYXRoQ29tcG9uZW50KEludGVybmFsQmxvY2tNYXRoLCB7IGRpc3BsYXlNb2RlOiB0cnVlIH0pO1xuZXhwb3J0IGNvbnN0IElubGluZU1hdGggPSBjcmVhdGVNYXRoQ29tcG9uZW50KEludGVybmFsSW5saW5lTWF0aCwgeyBkaXNwbGF5TW9kZTogZmFsc2UgfSk7XG4iXSwibmFtZXMiOlsiQmxvY2tNYXRoIiwiSW5saW5lTWF0aCIsImNyZWF0ZU1hdGhDb21wb25lbnQiLCJDb21wb25lbnQiLCJkaXNwbGF5TW9kZSIsIk1hdGhDb21wb25lbnQiLCJjaGlsZHJlbiIsImVycm9yQ29sb3IiLCJtYXRoIiwicmVuZGVyRXJyb3IiLCJmb3JtdWxhIiwiaHRtbCIsImVycm9yIiwidXNlTWVtbyIsIkthVGVYIiwicmVuZGVyVG9TdHJpbmciLCJ0aHJvd09uRXJyb3IiLCJ1bmRlZmluZWQiLCJQYXJzZUVycm9yIiwiVHlwZUVycm9yIiwibWVzc2FnZSIsInByb3BUeXBlcyIsIlByb3BUeXBlcyIsInN0cmluZyIsImZ1bmMiLCJJbnRlcm5hbFBhdGhDb21wb25lbnRQcm9wVHlwZXMiLCJpc1JlcXVpcmVkIiwiSW50ZXJuYWxCbG9ja01hdGgiLCJkaXYiLCJkYXRhLXRlc3RpZCIsImRhbmdlcm91c2x5U2V0SW5uZXJIVE1MIiwiX19odG1sIiwiSW50ZXJuYWxJbmxpbmVNYXRoIiwic3BhbiJdLCJtYXBwaW5ncyI6IkFBQUE7bUdBQStCLE9BQU8sV0FDaEIsWUFBWSxXQUNoQixPQUFPOzs7UUFGTSxPQUFPO1FBQ2hCLFlBQVk7UUFDaEIsT0FBTzs7Ozs7Ozs7Ozs7Ozs7O1FBdUZaQSxTQUFTLE1BQVRBLFNBQVM7UUFDVEMsVUFBVSxNQUFWQSxVQUFVOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0lBdEZ2Qjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0F1QkMsR0FFRCxNQUFNQyxtQkFBbUIsR0FBRyxDQUFDQyxTQUFTLEVBQUUsRUFBRUMsV0FBVyxDQUFBLEVBQUUsR0FBSztRQUMxRDs7OztHQUlDLEdBQ0QsTUFBTUMsYUFBYSxHQUFHLENBQUMsRUFBRUMsUUFBUSxDQUFBLEVBQUVDLFVBQVUsQ0FBQSxFQUFFQyxJQUFJLENBQUEsRUFBRUMsV0FBVyxDQUFBLEVBQUUsR0FBSztZQUNyRSxNQUFNQyxPQUFPLEdBQUdGLElBQUksYUFBSkEsSUFBSSxjQUFKQSxJQUFJLEdBQUlGLFFBQVEsQUFBQztZQUVqQyxNQUFNLEVBQUVLLElBQUksQ0FBQSxFQUFFQyxLQUFLLENBQUEsRUFBRSxHQUFHQyxJ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

//# sourceMappingURL=react-katex.js.map