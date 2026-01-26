"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIdentifier = void 0;
// From: https://github.com/styleguidist/react-docgen-typescript/blob/287e7012843cb26fed8f4bd8ee24e462c25a1414/src/parser.ts#L308-L317
const defaultComponentTypes = [
    "__function",
    "StatelessComponent",
    "Stateless",
    "StyledComponentClass",
    "StyledComponent",
    "FunctionComponent",
    "ForwardRefExoticComponent",
    "MemoExoticComponent",
];
function getIdentifier(d) {
    var _a;
    const name = (_a = d.expression) === null || _a === void 0 ? void 0 : _a.getName();
    // In those cases, react-docgen-typescript can not find a runtime name because a default export is used.
    // We fall back to the displayName, although this doesn't work for every case.
    //
    // It works in cases where the file name matches the variable name used for the default export:
    //
    // src/component/MyComponent.tsx
    // const MyComponent: React.FC<Props> = (props) => <></>;
    // export default MyComponent;
    return ["default", ...defaultComponentTypes].includes(name) || !name
        ? d.displayName
        : name;
}
exports.getIdentifier = getIdentifier;
//# sourceMappingURL=getIdentifier.js.map