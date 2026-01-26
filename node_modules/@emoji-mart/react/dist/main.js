var $1JSLv$react = require("react");
var $1JSLv$emojimart = require("emoji-mart");

function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}
function $parcel$defineInteropFlag(a) {
  Object.defineProperty(a, '__esModule', {value: true, configurable: true});
}
function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}

$parcel$defineInteropFlag(module.exports);

$parcel$export(module.exports, "default", () => $be92a0095b219678$export$2e2bcd8739ae039);


function $be92a0095b219678$export$2e2bcd8739ae039(props) {
    const ref = (0, $1JSLv$react.useRef)(null);
    const instance = (0, $1JSLv$react.useRef)(null);
    if (instance.current) instance.current.update(props);
    (0, $1JSLv$react.useEffect)(()=>{
        instance.current = new (0, $1JSLv$emojimart.Picker)({
            ...props,
            ref: ref
        });
        return ()=>{
            instance.current = null;
        };
    }, []);
    return /*#__PURE__*/ (0, ($parcel$interopDefault($1JSLv$react))).createElement("div", {
        ref: ref
    });
}


//# sourceMappingURL=main.js.map
