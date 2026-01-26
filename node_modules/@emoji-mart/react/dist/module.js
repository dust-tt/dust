import $dvPge$react, {useRef as $dvPge$useRef, useEffect as $dvPge$useEffect} from "react";
import {Picker as $dvPge$Picker} from "emoji-mart";



function $e5534fc185f7111e$export$2e2bcd8739ae039(props) {
    const ref = (0, $dvPge$useRef)(null);
    const instance = (0, $dvPge$useRef)(null);
    if (instance.current) instance.current.update(props);
    (0, $dvPge$useEffect)(()=>{
        instance.current = new (0, $dvPge$Picker)({
            ...props,
            ref: ref
        });
        return ()=>{
            instance.current = null;
        };
    }, []);
    return /*#__PURE__*/ (0, $dvPge$react).createElement("div", {
        ref: ref
    });
}


export {$e5534fc185f7111e$export$2e2bcd8739ae039 as default};
//# sourceMappingURL=module.js.map
