function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}
var $parcel$global =
typeof globalThis !== 'undefined'
  ? globalThis
  : typeof self !== 'undefined'
  ? self
  : typeof window !== 'undefined'
  ? window
  : typeof global !== 'undefined'
  ? global
  : {};
var $parcel$modules = {};
var $parcel$inits = {};

var parcelRequire = $parcel$global["parcelRequire3488"];
if (parcelRequire == null) {
  parcelRequire = function(id) {
    if (id in $parcel$modules) {
      return $parcel$modules[id].exports;
    }
    if (id in $parcel$inits) {
      var init = $parcel$inits[id];
      delete $parcel$inits[id];
      var module = {id: id, exports: {}};
      $parcel$modules[id] = module;
      init.call(module.exports, module, module.exports);
      return module.exports;
    }
    var err = new Error("Cannot find module '" + id + "'");
    err.code = 'MODULE_NOT_FOUND';
    throw err;
  };

  parcelRequire.register = function register(id, init) {
    $parcel$inits[id] = init;
  };

  $parcel$global["parcelRequire3488"] = parcelRequire;
}
parcelRequire.register("5MCow", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$435f37cb9bc908f3$var$_assertThisInitialized
});
function $435f37cb9bc908f3$var$_assertThisInitialized(self) {
    if (self === void 0) throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    return self;
}

});

parcelRequire.register("gntqc", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$bec59dd2b43305ef$var$_defineProperty
});
function $bec59dd2b43305ef$var$_defineProperty(obj, key, value) {
    if (key in obj) Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
    });
    else obj[key] = value;
    return obj;
}

});

parcelRequire.register("aZTUZ", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$801afa1190cb830e$var$_setPrototypeOf
});
function $801afa1190cb830e$var$setPrototypeOf(o1, p1) {
    $801afa1190cb830e$var$setPrototypeOf = Object.setPrototypeOf || function setPrototypeOf(o, p) {
        o.__proto__ = p;
        return o;
    };
    return $801afa1190cb830e$var$setPrototypeOf(o1, p1);
}
function $801afa1190cb830e$var$_setPrototypeOf(o, p) {
    return $801afa1190cb830e$var$setPrototypeOf(o, p);
}

});

parcelRequire.register("i9wps", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$d372352561be754b$var$_arrayWithHoles
});
function $d372352561be754b$var$_arrayWithHoles(arr) {
    if (Array.isArray(arr)) return arr;
}

});

parcelRequire.register("5x4Ey", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$4073a4cf3b9fae62$var$_iterableToArray
});
function $4073a4cf3b9fae62$var$_iterableToArray(iter) {
    if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter);
}

});

parcelRequire.register("jAleC", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$e421d9e4ecc526bf$var$_nonIterableRest
});
function $e421d9e4ecc526bf$var$_nonIterableRest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}

});

parcelRequire.register("3ZrhX", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$2e7c3c925079a416$var$_unsupportedIterableToArray
});

const $2e7c3c925079a416$var$_arrayLikeToArrayMjs = /*#__PURE__*/ $2e7c3c925079a416$var$_interopRequireDefault((parcelRequire("4mgHf")));
function $2e7c3c925079a416$var$_interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function $2e7c3c925079a416$var$_unsupportedIterableToArray(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return (0, $2e7c3c925079a416$var$_arrayLikeToArrayMjs.default)(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(n);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return (0, $2e7c3c925079a416$var$_arrayLikeToArrayMjs.default)(o, minLen);
}

});
parcelRequire.register("4mgHf", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$32c62b0f22f57c76$var$_arrayLikeToArray
});
function $32c62b0f22f57c76$var$_arrayLikeToArray(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}

});


parcelRequire.register("byStp", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$86ad1ff221d5f413$var$_arrayWithoutHoles
});

const $86ad1ff221d5f413$var$_arrayLikeToArrayMjs = /*#__PURE__*/ $86ad1ff221d5f413$var$_interopRequireDefault((parcelRequire("4mgHf")));
function $86ad1ff221d5f413$var$_interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function $86ad1ff221d5f413$var$_arrayWithoutHoles(arr) {
    if (Array.isArray(arr)) return (0, $86ad1ff221d5f413$var$_arrayLikeToArrayMjs.default)(arr);
}

});

parcelRequire.register("cgfek", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$8ed2cb042aa1f132$var$_nonIterableSpread
});
function $8ed2cb042aa1f132$var$_nonIterableSpread() {
    throw new TypeError("Invalid attempt to spread non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}

});

parcelRequire.register("7r1fY", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$569c078be76aa550$var$_isNativeReflectConstruct
});
function $569c078be76aa550$var$_isNativeReflectConstruct() {
    if (typeof Reflect === "undefined" || !Reflect.construct) return false;
    if (Reflect.construct.sham) return false;
    if (typeof Proxy === "function") return true;
    try {
        Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {}));
        return true;
    } catch (e) {
        return false;
    }
}

});

parcelRequire.register("680au", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$47639ed9037f0dfe$var$_getPrototypeOf
});
function $47639ed9037f0dfe$var$getPrototypeOf(o1) {
    $47639ed9037f0dfe$var$getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function getPrototypeOf(o) {
        return o.__proto__ || Object.getPrototypeOf(o);
    };
    return $47639ed9037f0dfe$var$getPrototypeOf(o1);
}
function $47639ed9037f0dfe$var$_getPrototypeOf(o) {
    return $47639ed9037f0dfe$var$getPrototypeOf(o);
}

});

parcelRequire.register("5Pjk4", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$43e0b43d63fde60e$var$_possibleConstructorReturn
});

const $43e0b43d63fde60e$var$_assertThisInitializedMjs = /*#__PURE__*/ $43e0b43d63fde60e$var$_interopRequireDefault((parcelRequire("5MCow")));

const $43e0b43d63fde60e$var$_typeOfMjs = /*#__PURE__*/ $43e0b43d63fde60e$var$_interopRequireDefault((parcelRequire("hdvdM")));
function $43e0b43d63fde60e$var$_interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function $43e0b43d63fde60e$var$_possibleConstructorReturn(self, call) {
    if (call && ((0, $43e0b43d63fde60e$var$_typeOfMjs.default)(call) === "object" || typeof call === "function")) return call;
    return (0, $43e0b43d63fde60e$var$_assertThisInitializedMjs.default)(self);
}

});
parcelRequire.register("hdvdM", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$c88bde7538db728c$var$_typeof
});
function $c88bde7538db728c$var$_typeof(obj) {
    "@swc/helpers - typeof";
    return obj && obj.constructor === Symbol ? "symbol" : typeof obj;
}

});


parcelRequire.register("e2Hua", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$a392fbea9d78dd8f$var$_construct
});

const $a392fbea9d78dd8f$var$_setPrototypeOfMjs = /*#__PURE__*/ $a392fbea9d78dd8f$var$_interopRequireDefault((parcelRequire("aZTUZ")));
function $a392fbea9d78dd8f$var$_interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function $a392fbea9d78dd8f$var$isNativeReflectConstruct() {
    if (typeof Reflect === "undefined" || !Reflect.construct) return false;
    if (Reflect.construct.sham) return false;
    if (typeof Proxy === "function") return true;
    try {
        Date.prototype.toString.call(Reflect.construct(Date, [], function() {}));
        return true;
    } catch (e) {
        return false;
    }
}
function $a392fbea9d78dd8f$var$construct(Parent1, args1, Class1) {
    if ($a392fbea9d78dd8f$var$isNativeReflectConstruct()) $a392fbea9d78dd8f$var$construct = Reflect.construct;
    else $a392fbea9d78dd8f$var$construct = function construct(Parent, args, Class) {
        var a = [
            null
        ];
        a.push.apply(a, args);
        var Constructor = Function.bind.apply(Parent, a);
        var instance = new Constructor();
        if (Class) (0, $a392fbea9d78dd8f$var$_setPrototypeOfMjs.default)(instance, Class.prototype);
        return instance;
    };
    return $a392fbea9d78dd8f$var$construct.apply(null, arguments);
}
function $a392fbea9d78dd8f$var$_construct(Parent, args, Class) {
    return $a392fbea9d78dd8f$var$construct.apply(null, arguments);
}

});

parcelRequire.register("jeCu1", function(module, exports) {
"use strict";
Object.defineProperty(module.exports, "__esModule", {
    value: true
});
Object.defineProperty(module.exports, "default", {
    enumerable: true,
    get: ()=>$e00d2d1c622a8872$var$_isNativeFunction
});
function $e00d2d1c622a8872$var$_isNativeFunction(fn) {
    return Function.toString.call(fn).indexOf("[native code]") !== -1;
}

});


$parcel$export(module.exports, "Picker", function () { return $31da1154e788841c$export$2e2bcd8739ae039; });
$parcel$export(module.exports, "Emoji", function () { return $51648ec150f74990$export$2e2bcd8739ae039; });
$parcel$export(module.exports, "FrequentlyUsed", function () { return $79925e24c549250c$export$2e2bcd8739ae039; });
$parcel$export(module.exports, "SafeFlags", function () { return $fc6326626d221acf$export$bcb25aa587e9cb13; });
$parcel$export(module.exports, "SearchIndex", function () { return $022b4a7de802d8eb$export$2e2bcd8739ae039; });
$parcel$export(module.exports, "Store", function () { return $000e3cabb83607f9$export$2e2bcd8739ae039; });
$parcel$export(module.exports, "init", function () { return $47b4a70d4572a3b3$export$2cd8252107eb640b; });
$parcel$export(module.exports, "Data", function () { return $47b4a70d4572a3b3$export$2d0294657ab35f1b; });
$parcel$export(module.exports, "I18n", function () { return $47b4a70d4572a3b3$export$dbe3113d60765c1a; });
$parcel$export(module.exports, "getEmojiDataFromNative", function () { return $0542300b6c56b62c$export$5ef5574deca44bc0; });

var $5MCow = parcelRequire("5MCow");
var $f653aaea2ce76311$exports = {};
"use strict";
Object.defineProperty($f653aaea2ce76311$exports, "__esModule", {
    value: true
});
Object.defineProperty($f653aaea2ce76311$exports, "default", {
    enumerable: true,
    get: ()=>$f653aaea2ce76311$var$_asyncToGenerator
});
function $f653aaea2ce76311$var$asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
    try {
        var info = gen[key](arg);
        var value = info.value;
    } catch (error) {
        reject(error);
        return;
    }
    if (info.done) resolve(value);
    else Promise.resolve(value).then(_next, _throw);
}
function $f653aaea2ce76311$var$_asyncToGenerator(fn) {
    return function() {
        var self = this, args = arguments;
        return new Promise(function(resolve, reject) {
            var gen = fn.apply(self, args);
            function _next(value) {
                $f653aaea2ce76311$var$asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
            }
            function _throw(err) {
                $f653aaea2ce76311$var$asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
            }
            _next(undefined);
        });
    };
}


var $aceb8ee155713853$exports = {};
"use strict";
Object.defineProperty($aceb8ee155713853$exports, "__esModule", {
    value: true
});
Object.defineProperty($aceb8ee155713853$exports, "default", {
    enumerable: true,
    get: ()=>$aceb8ee155713853$var$_classCallCheck
});
function $aceb8ee155713853$var$_classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) throw new TypeError("Cannot call a class as a function");
}


var $bf5a3d69977e47ef$exports = {};
"use strict";
Object.defineProperty($bf5a3d69977e47ef$exports, "__esModule", {
    value: true
});
Object.defineProperty($bf5a3d69977e47ef$exports, "default", {
    enumerable: true,
    get: ()=>$bf5a3d69977e47ef$var$_createClass
});
function $bf5a3d69977e47ef$var$_defineProperties(target, props) {
    for(var i = 0; i < props.length; i++){
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
    }
}
function $bf5a3d69977e47ef$var$_createClass(Constructor, protoProps, staticProps) {
    if (protoProps) $bf5a3d69977e47ef$var$_defineProperties(Constructor.prototype, protoProps);
    if (staticProps) $bf5a3d69977e47ef$var$_defineProperties(Constructor, staticProps);
    return Constructor;
}



var $gntqc = parcelRequire("gntqc");
var $668009e4f1a1d720$exports = {};
"use strict";
Object.defineProperty($668009e4f1a1d720$exports, "__esModule", {
    value: true
});
Object.defineProperty($668009e4f1a1d720$exports, "default", {
    enumerable: true,
    get: ()=>$668009e4f1a1d720$var$_inherits
});

const $668009e4f1a1d720$var$_setPrototypeOfMjs = /*#__PURE__*/ $668009e4f1a1d720$var$_interopRequireDefault((parcelRequire("aZTUZ")));
function $668009e4f1a1d720$var$_interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function $668009e4f1a1d720$var$_inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) throw new TypeError("Super expression must either be null or a function");
    subClass.prototype = Object.create(superClass && superClass.prototype, {
        constructor: {
            value: subClass,
            writable: true,
            configurable: true
        }
    });
    if (superClass) (0, $668009e4f1a1d720$var$_setPrototypeOfMjs.default)(subClass, superClass);
}


var $06c6b18a6115d5f3$exports = {};
"use strict";
Object.defineProperty($06c6b18a6115d5f3$exports, "__esModule", {
    value: true
});
Object.defineProperty($06c6b18a6115d5f3$exports, "default", {
    enumerable: true,
    get: ()=>$06c6b18a6115d5f3$var$_objectSpread
});

const $06c6b18a6115d5f3$var$_definePropertyMjs = /*#__PURE__*/ $06c6b18a6115d5f3$var$_interopRequireDefault((parcelRequire("gntqc")));
function $06c6b18a6115d5f3$var$_interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function $06c6b18a6115d5f3$var$_objectSpread(target) {
    for(var i = 1; i < arguments.length; i++){
        var source = arguments[i] != null ? arguments[i] : {};
        var ownKeys = Object.keys(source);
        if (typeof Object.getOwnPropertySymbols === "function") ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function(sym) {
            return Object.getOwnPropertyDescriptor(source, sym).enumerable;
        }));
        ownKeys.forEach(function(key) {
            (0, $06c6b18a6115d5f3$var$_definePropertyMjs.default)(target, key, source[key]);
        });
    }
    return target;
}


var $f521ef7da5d46cb0$exports = {};
"use strict";
Object.defineProperty($f521ef7da5d46cb0$exports, "__esModule", {
    value: true
});
Object.defineProperty($f521ef7da5d46cb0$exports, "default", {
    enumerable: true,
    get: ()=>$f521ef7da5d46cb0$var$_slicedToArray
});

const $f521ef7da5d46cb0$var$_arrayWithHolesMjs = /*#__PURE__*/ $f521ef7da5d46cb0$var$_interopRequireDefault((parcelRequire("i9wps")));

const $f521ef7da5d46cb0$var$_iterableToArrayMjs = /*#__PURE__*/ $f521ef7da5d46cb0$var$_interopRequireDefault((parcelRequire("5x4Ey")));

const $f521ef7da5d46cb0$var$_nonIterableRestMjs = /*#__PURE__*/ $f521ef7da5d46cb0$var$_interopRequireDefault((parcelRequire("jAleC")));

const $f521ef7da5d46cb0$var$_unsupportedIterableToArrayMjs = /*#__PURE__*/ $f521ef7da5d46cb0$var$_interopRequireDefault((parcelRequire("3ZrhX")));
function $f521ef7da5d46cb0$var$_interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function $f521ef7da5d46cb0$var$_slicedToArray(arr, i) {
    return (0, $f521ef7da5d46cb0$var$_arrayWithHolesMjs.default)(arr) || (0, $f521ef7da5d46cb0$var$_iterableToArrayMjs.default)(arr, i) || (0, $f521ef7da5d46cb0$var$_unsupportedIterableToArrayMjs.default)(arr, i) || (0, $f521ef7da5d46cb0$var$_nonIterableRestMjs.default)();
}


var $768065e6069a057e$exports = {};
"use strict";
Object.defineProperty($768065e6069a057e$exports, "__esModule", {
    value: true
});
Object.defineProperty($768065e6069a057e$exports, "default", {
    enumerable: true,
    get: ()=>$768065e6069a057e$var$_toConsumableArray
});

const $768065e6069a057e$var$_arrayWithoutHolesMjs = /*#__PURE__*/ $768065e6069a057e$var$_interopRequireDefault((parcelRequire("byStp")));

const $768065e6069a057e$var$_iterableToArrayMjs = /*#__PURE__*/ $768065e6069a057e$var$_interopRequireDefault((parcelRequire("5x4Ey")));

const $768065e6069a057e$var$_nonIterableSpreadMjs = /*#__PURE__*/ $768065e6069a057e$var$_interopRequireDefault((parcelRequire("cgfek")));

const $768065e6069a057e$var$_unsupportedIterableToArrayMjs = /*#__PURE__*/ $768065e6069a057e$var$_interopRequireDefault((parcelRequire("3ZrhX")));
function $768065e6069a057e$var$_interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function $768065e6069a057e$var$_toConsumableArray(arr) {
    return (0, $768065e6069a057e$var$_arrayWithoutHolesMjs.default)(arr) || (0, $768065e6069a057e$var$_iterableToArrayMjs.default)(arr) || (0, $768065e6069a057e$var$_unsupportedIterableToArrayMjs.default)(arr) || (0, $768065e6069a057e$var$_nonIterableSpreadMjs.default)();
}


var $a72404fd66b37813$exports = {};
"use strict";
Object.defineProperty($a72404fd66b37813$exports, "__esModule", {
    value: true
});
Object.defineProperty($a72404fd66b37813$exports, "default", {
    enumerable: true,
    get: ()=>$a72404fd66b37813$var$_createSuper
});

const $a72404fd66b37813$var$_isNativeReflectConstructMjs = /*#__PURE__*/ $a72404fd66b37813$var$_interopRequireDefault((parcelRequire("7r1fY")));

const $a72404fd66b37813$var$_getPrototypeOfMjs = /*#__PURE__*/ $a72404fd66b37813$var$_interopRequireDefault((parcelRequire("680au")));

const $a72404fd66b37813$var$_possibleConstructorReturnMjs = /*#__PURE__*/ $a72404fd66b37813$var$_interopRequireDefault((parcelRequire("5Pjk4")));
function $a72404fd66b37813$var$_interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function $a72404fd66b37813$var$_createSuper(Derived) {
    var hasNativeReflectConstruct = (0, $a72404fd66b37813$var$_isNativeReflectConstructMjs.default)();
    return function _createSuperInternal() {
        var Super = (0, $a72404fd66b37813$var$_getPrototypeOfMjs.default)(Derived), result;
        if (hasNativeReflectConstruct) {
            var NewTarget = (0, $a72404fd66b37813$var$_getPrototypeOfMjs.default)(this).constructor;
            result = Reflect.construct(Super, arguments, NewTarget);
        } else result = Super.apply(this, arguments);
        return (0, $a72404fd66b37813$var$_possibleConstructorReturnMjs.default)(this, result);
    };
}


var $f5fc4923ef4118c4$exports = {};
/**
 * Copyright (c) 2014-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ var $f5fc4923ef4118c4$var$runtime = function(exports) {
    "use strict";
    var Op = Object.prototype;
    var hasOwn = Op.hasOwnProperty;
    var undefined; // More compressible than void 0.
    var $Symbol = typeof Symbol === "function" ? Symbol : {};
    var iteratorSymbol = $Symbol.iterator || "@@iterator";
    var asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator";
    var toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";
    function define(obj, key, value) {
        Object.defineProperty(obj, key, {
            value: value,
            enumerable: true,
            configurable: true,
            writable: true
        });
        return obj[key];
    }
    try {
        // IE 8 has a broken Object.defineProperty that only works on DOM objects.
        define({}, "");
    } catch (err1) {
        define = function define(obj, key, value) {
            return obj[key] = value;
        };
    }
    function wrap(innerFn, outerFn, self, tryLocsList) {
        // If outerFn provided and outerFn.prototype is a Generator, then outerFn.prototype instanceof Generator.
        var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
        var generator = Object.create(protoGenerator.prototype);
        var context = new Context(tryLocsList || []);
        // The ._invoke method unifies the implementations of the .next,
        // .throw, and .return methods.
        generator._invoke = makeInvokeMethod(innerFn, self, context);
        return generator;
    }
    exports.wrap = wrap;
    // Try/catch helper to minimize deoptimizations. Returns a completion
    // record like context.tryEntries[i].completion. This interface could
    // have been (and was previously) designed to take a closure to be
    // invoked without arguments, but in all the cases we care about we
    // already have an existing method we want to call, so there's no need
    // to create a new function object. We can even get away with assuming
    // the method takes exactly one argument, since that happens to be true
    // in every case, so we don't have to touch the arguments object. The
    // only additional allocation required is the completion record, which
    // has a stable shape and so hopefully should be cheap to allocate.
    function tryCatch(fn, obj, arg) {
        try {
            return {
                type: "normal",
                arg: fn.call(obj, arg)
            };
        } catch (err) {
            return {
                type: "throw",
                arg: err
            };
        }
    }
    var GenStateSuspendedStart = "suspendedStart";
    var GenStateSuspendedYield = "suspendedYield";
    var GenStateExecuting = "executing";
    var GenStateCompleted = "completed";
    // Returning this object from the innerFn has the same effect as
    // breaking out of the dispatch switch statement.
    var ContinueSentinel = {};
    // Dummy constructor functions that we use as the .constructor and
    // .constructor.prototype properties for functions that return Generator
    // objects. For full spec compliance, you may wish to configure your
    // minifier not to mangle the names of these two functions.
    function Generator() {}
    function GeneratorFunction() {}
    function GeneratorFunctionPrototype() {}
    // This is a polyfill for %IteratorPrototype% for environments that
    // don't natively support it.
    var IteratorPrototype = {};
    define(IteratorPrototype, iteratorSymbol, function() {
        return this;
    });
    var getProto = Object.getPrototypeOf;
    var NativeIteratorPrototype = getProto && getProto(getProto(values([])));
    if (NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol)) // This environment has a native %IteratorPrototype%; use it instead
    // of the polyfill.
    IteratorPrototype = NativeIteratorPrototype;
    var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype);
    GeneratorFunction.prototype = GeneratorFunctionPrototype;
    define(Gp, "constructor", GeneratorFunctionPrototype);
    define(GeneratorFunctionPrototype, "constructor", GeneratorFunction);
    GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction");
    // Helper for defining the .next, .throw, and .return methods of the
    // Iterator interface in terms of a single ._invoke method.
    function defineIteratorMethods(prototype) {
        [
            "next",
            "throw",
            "return"
        ].forEach(function(method) {
            define(prototype, method, function(arg) {
                return this._invoke(method, arg);
            });
        });
    }
    exports.isGeneratorFunction = function(genFun) {
        var ctor = typeof genFun === "function" && genFun.constructor;
        return ctor ? ctor === GeneratorFunction || // For the native GeneratorFunction constructor, the best we can
        // do is to check its .name property.
        (ctor.displayName || ctor.name) === "GeneratorFunction" : false;
    };
    exports.mark = function(genFun) {
        if (Object.setPrototypeOf) Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
        else {
            genFun.__proto__ = GeneratorFunctionPrototype;
            define(genFun, toStringTagSymbol, "GeneratorFunction");
        }
        genFun.prototype = Object.create(Gp);
        return genFun;
    };
    // Within the body of any async function, `await x` is transformed to
    // `yield regeneratorRuntime.awrap(x)`, so that the runtime can test
    // `hasOwn.call(value, "__await")` to determine if the yielded value is
    // meant to be awaited.
    exports.awrap = function(arg) {
        return {
            __await: arg
        };
    };
    function AsyncIterator(generator, PromiseImpl) {
        function invoke(method, arg, resolve, reject) {
            var record = tryCatch(generator[method], generator, arg);
            if (record.type === "throw") reject(record.arg);
            else {
                var result = record.arg;
                var value1 = result.value;
                if (value1 && typeof value1 === "object" && hasOwn.call(value1, "__await")) return PromiseImpl.resolve(value1.__await).then(function(value) {
                    invoke("next", value, resolve, reject);
                }, function(err) {
                    invoke("throw", err, resolve, reject);
                });
                return PromiseImpl.resolve(value1).then(function(unwrapped) {
                    // When a yielded Promise is resolved, its final value becomes
                    // the .value of the Promise<{value,done}> result for the
                    // current iteration.
                    result.value = unwrapped;
                    resolve(result);
                }, function(error) {
                    // If a rejected Promise was yielded, throw the rejection back
                    // into the async generator function so it can be handled there.
                    return invoke("throw", error, resolve, reject);
                });
            }
        }
        var previousPromise;
        function enqueue(method, arg) {
            function callInvokeWithMethodAndArg() {
                return new PromiseImpl(function(resolve, reject) {
                    invoke(method, arg, resolve, reject);
                });
            }
            return previousPromise = // If enqueue has been called before, then we want to wait until
            // all previous Promises have been resolved before calling invoke,
            // so that results are always delivered in the correct order. If
            // enqueue has not been called before, then it is important to
            // call invoke immediately, without waiting on a callback to fire,
            // so that the async generator function has the opportunity to do
            // any necessary setup in a predictable way. This predictability
            // is why the Promise constructor synchronously invokes its
            // executor callback, and why async functions synchronously
            // execute code before the first await. Since we implement simple
            // async functions in terms of async generators, it is especially
            // important to get this right, even though it requires care.
            previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, // Avoid propagating failures to Promises returned by later
            // invocations of the iterator.
            callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg();
        }
        // Define the unified helper method that is used to implement .next,
        // .throw, and .return (see defineIteratorMethods).
        this._invoke = enqueue;
    }
    defineIteratorMethods(AsyncIterator.prototype);
    define(AsyncIterator.prototype, asyncIteratorSymbol, function() {
        return this;
    });
    exports.AsyncIterator = AsyncIterator;
    // Note that simple async functions are implemented on top of
    // AsyncIterator objects; they just return a Promise for the value of
    // the final result produced by the iterator.
    exports.async = function(innerFn, outerFn, self, tryLocsList, PromiseImpl) {
        if (PromiseImpl === void 0) PromiseImpl = Promise;
        var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl);
        return exports.isGeneratorFunction(outerFn) ? iter // If outerFn is a generator, return the full iterator.
         : iter.next().then(function(result) {
            return result.done ? result.value : iter.next();
        });
    };
    function makeInvokeMethod(innerFn, self, context) {
        var state = GenStateSuspendedStart;
        return function invoke(method, arg) {
            if (state === GenStateExecuting) throw new Error("Generator is already running");
            if (state === GenStateCompleted) {
                if (method === "throw") throw arg;
                // Be forgiving, per 25.3.3.3.3 of the spec:
                // https://people.mozilla.org/~jorendorff/es6-draft.html#sec-generatorresume
                return doneResult();
            }
            context.method = method;
            context.arg = arg;
            while(true){
                var delegate = context.delegate;
                if (delegate) {
                    var delegateResult = maybeInvokeDelegate(delegate, context);
                    if (delegateResult) {
                        if (delegateResult === ContinueSentinel) continue;
                        return delegateResult;
                    }
                }
                if (context.method === "next") // Setting context._sent for legacy support of Babel's
                // function.sent implementation.
                context.sent = context._sent = context.arg;
                else if (context.method === "throw") {
                    if (state === GenStateSuspendedStart) {
                        state = GenStateCompleted;
                        throw context.arg;
                    }
                    context.dispatchException(context.arg);
                } else if (context.method === "return") context.abrupt("return", context.arg);
                state = GenStateExecuting;
                var record = tryCatch(innerFn, self, context);
                if (record.type === "normal") {
                    // If an exception is thrown from innerFn, we leave state ===
                    // GenStateExecuting and loop back for another invocation.
                    state = context.done ? GenStateCompleted : GenStateSuspendedYield;
                    if (record.arg === ContinueSentinel) continue;
                    return {
                        value: record.arg,
                        done: context.done
                    };
                } else if (record.type === "throw") {
                    state = GenStateCompleted;
                    // Dispatch the exception by looping back around to the
                    // context.dispatchException(context.arg) call above.
                    context.method = "throw";
                    context.arg = record.arg;
                }
            }
        };
    }
    // Call delegate.iterator[context.method](context.arg) and handle the
    // result, either by returning a { value, done } result from the
    // delegate iterator, or by modifying context.method and context.arg,
    // setting context.delegate to null, and returning the ContinueSentinel.
    function maybeInvokeDelegate(delegate, context) {
        var method = delegate.iterator[context.method];
        if (method === undefined) {
            // A .throw or .return when the delegate iterator has no .throw
            // method always terminates the yield* loop.
            context.delegate = null;
            if (context.method === "throw") {
                // Note: ["return"] must be used for ES3 parsing compatibility.
                if (delegate.iterator["return"]) {
                    // If the delegate iterator has a return method, give it a
                    // chance to clean up.
                    context.method = "return";
                    context.arg = undefined;
                    maybeInvokeDelegate(delegate, context);
                    if (context.method === "throw") // If maybeInvokeDelegate(context) changed context.method from
                    // "return" to "throw", let that override the TypeError below.
                    return ContinueSentinel;
                }
                context.method = "throw";
                context.arg = new TypeError("The iterator does not provide a 'throw' method");
            }
            return ContinueSentinel;
        }
        var record = tryCatch(method, delegate.iterator, context.arg);
        if (record.type === "throw") {
            context.method = "throw";
            context.arg = record.arg;
            context.delegate = null;
            return ContinueSentinel;
        }
        var info = record.arg;
        if (!info) {
            context.method = "throw";
            context.arg = new TypeError("iterator result is not an object");
            context.delegate = null;
            return ContinueSentinel;
        }
        if (info.done) {
            // Assign the result of the finished delegate to the temporary
            // variable specified by delegate.resultName (see delegateYield).
            context[delegate.resultName] = info.value;
            // Resume execution at the desired location (see delegateYield).
            context.next = delegate.nextLoc;
            // If context.method was "throw" but the delegate handled the
            // exception, let the outer generator proceed normally. If
            // context.method was "next", forget context.arg since it has been
            // "consumed" by the delegate iterator. If context.method was
            // "return", allow the original .return call to continue in the
            // outer generator.
            if (context.method !== "return") {
                context.method = "next";
                context.arg = undefined;
            }
        } else // Re-yield the result returned by the delegate method.
        return info;
        // The delegate iterator is finished, so forget it and continue with
        // the outer generator.
        context.delegate = null;
        return ContinueSentinel;
    }
    // Define Generator.prototype.{next,throw,return} in terms of the
    // unified ._invoke helper method.
    defineIteratorMethods(Gp);
    define(Gp, toStringTagSymbol, "Generator");
    // A Generator should always return itself as the iterator object when the
    // @@iterator function is called on it. Some browsers' implementations of the
    // iterator prototype chain incorrectly implement this, causing the Generator
    // object to not be returned from this call. This ensures that doesn't happen.
    // See https://github.com/facebook/regenerator/issues/274 for more details.
    define(Gp, iteratorSymbol, function() {
        return this;
    });
    define(Gp, "toString", function() {
        return "[object Generator]";
    });
    function pushTryEntry(locs) {
        var entry = {
            tryLoc: locs[0]
        };
        if (1 in locs) entry.catchLoc = locs[1];
        if (2 in locs) {
            entry.finallyLoc = locs[2];
            entry.afterLoc = locs[3];
        }
        this.tryEntries.push(entry);
    }
    function resetTryEntry(entry) {
        var record = entry.completion || {};
        record.type = "normal";
        delete record.arg;
        entry.completion = record;
    }
    function Context(tryLocsList) {
        // The root entry object (effectively a try statement without a catch
        // or a finally block) gives us a place to store values thrown from
        // locations where there is no enclosing try statement.
        this.tryEntries = [
            {
                tryLoc: "root"
            }
        ];
        tryLocsList.forEach(pushTryEntry, this);
        this.reset(true);
    }
    exports.keys = function(object) {
        var keys = [];
        for(var key1 in object)keys.push(key1);
        keys.reverse();
        // Rather than returning an object with a next method, we keep
        // things simple and return the next function itself.
        return function next() {
            while(keys.length){
                var key = keys.pop();
                if (key in object) {
                    next.value = key;
                    next.done = false;
                    return next;
                }
            }
            // To avoid creating an additional object, we just hang the .value
            // and .done properties off the next function object itself. This
            // also ensures that the minifier will not anonymize the function.
            next.done = true;
            return next;
        };
    };
    function values(iterable) {
        if (iterable) {
            var iteratorMethod = iterable[iteratorSymbol];
            if (iteratorMethod) return iteratorMethod.call(iterable);
            if (typeof iterable.next === "function") return iterable;
            if (!isNaN(iterable.length)) {
                var i = -1, next1 = function next() {
                    while(++i < iterable.length)if (hasOwn.call(iterable, i)) {
                        next.value = iterable[i];
                        next.done = false;
                        return next;
                    }
                    next.value = undefined;
                    next.done = true;
                    return next;
                };
                return next1.next = next1;
            }
        }
        // Return an iterator with no values.
        return {
            next: doneResult
        };
    }
    exports.values = values;
    function doneResult() {
        return {
            value: undefined,
            done: true
        };
    }
    Context.prototype = {
        constructor: Context,
        reset: function reset(skipTempReset) {
            this.prev = 0;
            this.next = 0;
            // Resetting context._sent for legacy support of Babel's
            // function.sent implementation.
            this.sent = this._sent = undefined;
            this.done = false;
            this.delegate = null;
            this.method = "next";
            this.arg = undefined;
            this.tryEntries.forEach(resetTryEntry);
            if (!skipTempReset) {
                for(var name in this)// Not sure about the optimal order of these conditions:
                if (name.charAt(0) === "t" && hasOwn.call(this, name) && !isNaN(+name.slice(1))) this[name] = undefined;
            }
        },
        stop: function stop() {
            this.done = true;
            var rootEntry = this.tryEntries[0];
            var rootRecord = rootEntry.completion;
            if (rootRecord.type === "throw") throw rootRecord.arg;
            return this.rval;
        },
        dispatchException: function dispatchException(exception) {
            if (this.done) throw exception;
            var context = this;
            function handle(loc, caught) {
                record.type = "throw";
                record.arg = exception;
                context.next = loc;
                if (caught) {
                    // If the dispatched exception was caught by a catch block,
                    // then let that catch block handle the exception normally.
                    context.method = "next";
                    context.arg = undefined;
                }
                return !!caught;
            }
            for(var i = this.tryEntries.length - 1; i >= 0; --i){
                var entry = this.tryEntries[i];
                var record = entry.completion;
                if (entry.tryLoc === "root") // Exception thrown outside of any try block that could handle
                // it, so set the completion value of the entire function to
                // throw the exception.
                return handle("end");
                if (entry.tryLoc <= this.prev) {
                    var hasCatch = hasOwn.call(entry, "catchLoc");
                    var hasFinally = hasOwn.call(entry, "finallyLoc");
                    if (hasCatch && hasFinally) {
                        if (this.prev < entry.catchLoc) return handle(entry.catchLoc, true);
                        else if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc);
                    } else if (hasCatch) {
                        if (this.prev < entry.catchLoc) return handle(entry.catchLoc, true);
                    } else if (hasFinally) {
                        if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc);
                    } else throw new Error("try statement without catch or finally");
                }
            }
        },
        abrupt: function abrupt(type, arg) {
            for(var i = this.tryEntries.length - 1; i >= 0; --i){
                var entry = this.tryEntries[i];
                if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) {
                    var finallyEntry = entry;
                    break;
                }
            }
            if (finallyEntry && (type === "break" || type === "continue") && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc) // Ignore the finally entry if control is not jumping to a
            // location outside the try/catch block.
            finallyEntry = null;
            var record = finallyEntry ? finallyEntry.completion : {};
            record.type = type;
            record.arg = arg;
            if (finallyEntry) {
                this.method = "next";
                this.next = finallyEntry.finallyLoc;
                return ContinueSentinel;
            }
            return this.complete(record);
        },
        complete: function complete(record, afterLoc) {
            if (record.type === "throw") throw record.arg;
            if (record.type === "break" || record.type === "continue") this.next = record.arg;
            else if (record.type === "return") {
                this.rval = this.arg = record.arg;
                this.method = "return";
                this.next = "end";
            } else if (record.type === "normal" && afterLoc) this.next = afterLoc;
            return ContinueSentinel;
        },
        finish: function finish(finallyLoc) {
            for(var i = this.tryEntries.length - 1; i >= 0; --i){
                var entry = this.tryEntries[i];
                if (entry.finallyLoc === finallyLoc) {
                    this.complete(entry.completion, entry.afterLoc);
                    resetTryEntry(entry);
                    return ContinueSentinel;
                }
            }
        },
        "catch": function(tryLoc) {
            for(var i = this.tryEntries.length - 1; i >= 0; --i){
                var entry = this.tryEntries[i];
                if (entry.tryLoc === tryLoc) {
                    var record = entry.completion;
                    if (record.type === "throw") {
                        var thrown = record.arg;
                        resetTryEntry(entry);
                    }
                    return thrown;
                }
            }
            // The context.catch method must only be called with a location
            // argument that corresponds to a known catch block.
            throw new Error("illegal catch attempt");
        },
        delegateYield: function delegateYield(iterable, resultName, nextLoc) {
            this.delegate = {
                iterator: values(iterable),
                resultName: resultName,
                nextLoc: nextLoc
            };
            if (this.method === "next") // Deliberately forget the last sent value so that we don't
            // accidentally pass it on to the delegate.
            this.arg = undefined;
            return ContinueSentinel;
        }
    };
    // Regardless of whether this script is executing as a CommonJS module
    // or not, return the runtime object so that we can declare the variable
    // regeneratorRuntime in the outer scope, which allows this module to be
    // injected easily by `bin/regenerator --include-runtime script.js`.
    return exports;
}($f5fc4923ef4118c4$exports);
try {
    regeneratorRuntime = $f5fc4923ef4118c4$var$runtime;
} catch (accidentalStrictMode) {
    // This module should not be running in strict mode, so the above
    // assignment should always work unless something is misconfigured. Just
    // in case runtime.js accidentally runs in strict mode, in modern engines
    // we can explicitly access globalThis. In older engines we can escape
    // strict mode using a global Function call. This could conceivably fail
    // if a Content Security Policy forbids using Function, but in that case
    // the proper solution is to fix the accidental strict mode problem. If
    // you've misconfigured your bundler to force strict mode and applied a
    // CSP to forbid Function, and you're not willing to fix either of those
    // problems, please detail your unique predicament in a GitHub issue.
    if (typeof globalThis === "object") globalThis.regeneratorRuntime = $f5fc4923ef4118c4$var$runtime;
    else Function("r", "regeneratorRuntime = r")($f5fc4923ef4118c4$var$runtime);
}



var $hdvdM = parcelRequire("hdvdM");
var $d5fc6ac583bc94a1$var$n, $d5fc6ac583bc94a1$export$41c562ebe57d11e2, $d5fc6ac583bc94a1$var$u, $d5fc6ac583bc94a1$export$a8257692ac88316c, $d5fc6ac583bc94a1$var$t, $d5fc6ac583bc94a1$var$r, $d5fc6ac583bc94a1$var$o, $d5fc6ac583bc94a1$var$f, $d5fc6ac583bc94a1$var$e = {}, $d5fc6ac583bc94a1$var$c = [], $d5fc6ac583bc94a1$var$s = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
function $d5fc6ac583bc94a1$var$a(n1, l1) {
    for(var u1 in l1)n1[u1] = l1[u1];
    return n1;
}
function $d5fc6ac583bc94a1$var$h(n2) {
    var l2 = n2.parentNode;
    l2 && l2.removeChild(n2);
}
function $d5fc6ac583bc94a1$export$c8a8987d4410bf2d(l3, u2, i1) {
    var t1, r1, o1, f1 = {};
    for(o1 in u2)"key" == o1 ? t1 = u2[o1] : "ref" == o1 ? r1 = u2[o1] : f1[o1] = u2[o1];
    if (arguments.length > 2 && (f1.children = arguments.length > 3 ? $d5fc6ac583bc94a1$var$n.call(arguments, 2) : i1), "function" == typeof l3 && null != l3.defaultProps) for(o1 in l3.defaultProps)void 0 === f1[o1] && (f1[o1] = l3.defaultProps[o1]);
    return $d5fc6ac583bc94a1$var$y(l3, f1, t1, r1, null);
}
function $d5fc6ac583bc94a1$var$y(n3, i2, t2, r2, o2) {
    var f2 = {
        type: n3,
        props: i2,
        key: t2,
        ref: r2,
        __k: null,
        __: null,
        __b: 0,
        __e: null,
        __d: void 0,
        __c: null,
        __h: null,
        constructor: void 0,
        __v: null == o2 ? ++$d5fc6ac583bc94a1$var$u : o2
    };
    return null == o2 && null != $d5fc6ac583bc94a1$export$41c562ebe57d11e2.vnode && $d5fc6ac583bc94a1$export$41c562ebe57d11e2.vnode(f2), f2;
}
function $d5fc6ac583bc94a1$export$7d1e3a5e95ceca43() {
    return {
        current: null
    };
}
function $d5fc6ac583bc94a1$export$ffb0004e005737fa(n4) {
    return n4.children;
}
function $d5fc6ac583bc94a1$export$16fa2f45be04daa8(n5, l4) {
    this.props = n5, this.context = l4;
}
function $d5fc6ac583bc94a1$var$k(n6, l5) {
    if (null == l5) return n6.__ ? $d5fc6ac583bc94a1$var$k(n6.__, n6.__.__k.indexOf(n6) + 1) : null;
    for(var u3; l5 < n6.__k.length; l5++)if (null != (u3 = n6.__k[l5]) && null != u3.__e) return u3.__e;
    return "function" == typeof n6.type ? $d5fc6ac583bc94a1$var$k(n6) : null;
}
function $d5fc6ac583bc94a1$var$b(n7) {
    var l6, u4;
    if (null != (n7 = n7.__) && null != n7.__c) {
        for(n7.__e = n7.__c.base = null, l6 = 0; l6 < n7.__k.length; l6++)if (null != (u4 = n7.__k[l6]) && null != u4.__e) {
            n7.__e = n7.__c.base = u4.__e;
            break;
        }
        return $d5fc6ac583bc94a1$var$b(n7);
    }
}
function $d5fc6ac583bc94a1$var$m(n8) {
    (!n8.__d && (n8.__d = !0) && $d5fc6ac583bc94a1$var$t.push(n8) && !$d5fc6ac583bc94a1$var$g.__r++ || $d5fc6ac583bc94a1$var$o !== $d5fc6ac583bc94a1$export$41c562ebe57d11e2.debounceRendering) && (($d5fc6ac583bc94a1$var$o = $d5fc6ac583bc94a1$export$41c562ebe57d11e2.debounceRendering) || $d5fc6ac583bc94a1$var$r)($d5fc6ac583bc94a1$var$g);
}
function $d5fc6ac583bc94a1$var$g() {
    for(var n9; $d5fc6ac583bc94a1$var$g.__r = $d5fc6ac583bc94a1$var$t.length;)n9 = $d5fc6ac583bc94a1$var$t.sort(function(n10, l7) {
        return n10.__v.__b - l7.__v.__b;
    }), $d5fc6ac583bc94a1$var$t = [], n9.some(function(n11) {
        var l8, u5, i3, t3, r3, o3;
        n11.__d && (r3 = (t3 = (l8 = n11).__v).__e, (o3 = l8.__P) && (u5 = [], (i3 = $d5fc6ac583bc94a1$var$a({}, t3)).__v = t3.__v + 1, $d5fc6ac583bc94a1$var$j(o3, t3, i3, l8.__n, void 0 !== o3.ownerSVGElement, null != t3.__h ? [
            r3
        ] : null, u5, null == r3 ? $d5fc6ac583bc94a1$var$k(t3) : r3, t3.__h), $d5fc6ac583bc94a1$var$z(u5, t3), t3.__e != r3 && $d5fc6ac583bc94a1$var$b(t3)));
    });
}
function $d5fc6ac583bc94a1$var$w(n12, l9, u6, i4, t4, r4, o4, f3, s1, a1) {
    var h1, v1, p1, _$_, b1, m1, _$g, w1 = i4 && i4.__k || $d5fc6ac583bc94a1$var$c, A1 = w1.length;
    for(u6.__k = [], h1 = 0; h1 < l9.length; h1++)if (null != (_$_ = u6.__k[h1] = null == (_$_ = l9[h1]) || "boolean" == typeof _$_ ? null : "string" == typeof _$_ || "number" == typeof _$_ || "bigint" == (typeof _$_ === "undefined" ? "undefined" : (0, (/*@__PURE__*/$parcel$interopDefault($hdvdM)))(_$_)) ? $d5fc6ac583bc94a1$var$y(null, _$_, null, null, _$_) : Array.isArray(_$_) ? $d5fc6ac583bc94a1$var$y($d5fc6ac583bc94a1$export$ffb0004e005737fa, {
        children: _$_
    }, null, null, null) : _$_.__b > 0 ? $d5fc6ac583bc94a1$var$y(_$_.type, _$_.props, _$_.key, null, _$_.__v) : _$_)) {
        if (_$_.__ = u6, _$_.__b = u6.__b + 1, null === (p1 = w1[h1]) || p1 && _$_.key == p1.key && _$_.type === p1.type) w1[h1] = void 0;
        else for(v1 = 0; v1 < A1; v1++){
            if ((p1 = w1[v1]) && _$_.key == p1.key && _$_.type === p1.type) {
                w1[v1] = void 0;
                break;
            }
            p1 = null;
        }
        $d5fc6ac583bc94a1$var$j(n12, _$_, p1 = p1 || $d5fc6ac583bc94a1$var$e, t4, r4, o4, f3, s1, a1), b1 = _$_.__e, (v1 = _$_.ref) && p1.ref != v1 && (_$g || (_$g = []), p1.ref && _$g.push(p1.ref, null, _$_), _$g.push(v1, _$_.__c || b1, _$_)), null != b1 ? (null == m1 && (m1 = b1), "function" == typeof _$_.type && _$_.__k === p1.__k ? _$_.__d = s1 = $d5fc6ac583bc94a1$var$x(_$_, s1, n12) : s1 = $d5fc6ac583bc94a1$var$P(n12, _$_, p1, w1, b1, s1), "function" == typeof u6.type && (u6.__d = s1)) : s1 && p1.__e == s1 && s1.parentNode != n12 && (s1 = $d5fc6ac583bc94a1$var$k(p1));
    }
    for(u6.__e = m1, h1 = A1; h1--;)null != w1[h1] && ("function" == typeof u6.type && null != w1[h1].__e && w1[h1].__e == u6.__d && (u6.__d = $d5fc6ac583bc94a1$var$k(i4, h1 + 1)), $d5fc6ac583bc94a1$var$N(w1[h1], w1[h1]));
    if (_$g) for(h1 = 0; h1 < _$g.length; h1++)$d5fc6ac583bc94a1$var$M(_$g[h1], _$g[++h1], _$g[++h1]);
}
function $d5fc6ac583bc94a1$var$x(n13, l10, u7) {
    for(var i5, t5 = n13.__k, r5 = 0; t5 && r5 < t5.length; r5++)(i5 = t5[r5]) && (i5.__ = n13, l10 = "function" == typeof i5.type ? $d5fc6ac583bc94a1$var$x(i5, l10, u7) : $d5fc6ac583bc94a1$var$P(u7, i5, i5, t5, i5.__e, l10));
    return l10;
}
function $d5fc6ac583bc94a1$export$47e4c5b300681277(n14, l11) {
    return l11 = l11 || [], null == n14 || "boolean" == typeof n14 || (Array.isArray(n14) ? n14.some(function(n15) {
        $d5fc6ac583bc94a1$export$47e4c5b300681277(n15, l11);
    }) : l11.push(n14)), l11;
}
function $d5fc6ac583bc94a1$var$P(n16, l12, u8, i6, t6, r6) {
    var o5, f4, e1;
    if (void 0 !== l12.__d) o5 = l12.__d, l12.__d = void 0;
    else if (null == u8 || t6 != r6 || null == t6.parentNode) n: if (null == r6 || r6.parentNode !== n16) n16.appendChild(t6), o5 = null;
    else {
        for(f4 = r6, e1 = 0; (f4 = f4.nextSibling) && e1 < i6.length; e1 += 2)if (f4 == t6) break n;
        n16.insertBefore(t6, r6), o5 = r6;
    }
    return void 0 !== o5 ? o5 : t6.nextSibling;
}
function $d5fc6ac583bc94a1$var$C(n17, l13, u9, i7, t7) {
    var r7;
    for(r7 in u9)"children" === r7 || "key" === r7 || r7 in l13 || $d5fc6ac583bc94a1$var$H(n17, r7, null, u9[r7], i7);
    for(r7 in l13)t7 && "function" != typeof l13[r7] || "children" === r7 || "key" === r7 || "value" === r7 || "checked" === r7 || u9[r7] === l13[r7] || $d5fc6ac583bc94a1$var$H(n17, r7, l13[r7], u9[r7], i7);
}
function $d5fc6ac583bc94a1$var$$(n18, l14, u10) {
    "-" === l14[0] ? n18.setProperty(l14, u10) : n18[l14] = null == u10 ? "" : "number" != typeof u10 || $d5fc6ac583bc94a1$var$s.test(l14) ? u10 : u10 + "px";
}
function $d5fc6ac583bc94a1$var$H(n19, l15, u11, i8, t8) {
    var r8;
    n: if ("style" === l15) {
        if ("string" == typeof u11) n19.style.cssText = u11;
        else {
            if ("string" == typeof i8 && (n19.style.cssText = i8 = ""), i8) for(l15 in i8)u11 && l15 in u11 || $d5fc6ac583bc94a1$var$$(n19.style, l15, "");
            if (u11) for(l15 in u11)i8 && u11[l15] === i8[l15] || $d5fc6ac583bc94a1$var$$(n19.style, l15, u11[l15]);
        }
    } else if ("o" === l15[0] && "n" === l15[1]) r8 = l15 !== (l15 = l15.replace(/Capture$/, "")), l15 = l15.toLowerCase() in n19 ? l15.toLowerCase().slice(2) : l15.slice(2), n19.l || (n19.l = {}), n19.l[l15 + r8] = u11, u11 ? i8 || n19.addEventListener(l15, r8 ? $d5fc6ac583bc94a1$var$T : $d5fc6ac583bc94a1$var$I, r8) : n19.removeEventListener(l15, r8 ? $d5fc6ac583bc94a1$var$T : $d5fc6ac583bc94a1$var$I, r8);
    else if ("dangerouslySetInnerHTML" !== l15) {
        if (t8) l15 = l15.replace(/xlink[H:h]/, "h").replace(/sName$/, "s");
        else if ("href" !== l15 && "list" !== l15 && "form" !== l15 && "tabIndex" !== l15 && "download" !== l15 && l15 in n19) try {
            n19[l15] = null == u11 ? "" : u11;
            break n;
        } catch (n) {}
        "function" == typeof u11 || (null != u11 && (!1 !== u11 || "a" === l15[0] && "r" === l15[1]) ? n19.setAttribute(l15, u11) : n19.removeAttribute(l15));
    }
}
function $d5fc6ac583bc94a1$var$I(n20) {
    this.l[n20.type + !1]($d5fc6ac583bc94a1$export$41c562ebe57d11e2.event ? $d5fc6ac583bc94a1$export$41c562ebe57d11e2.event(n20) : n20);
}
function $d5fc6ac583bc94a1$var$T(n21) {
    this.l[n21.type + !0]($d5fc6ac583bc94a1$export$41c562ebe57d11e2.event ? $d5fc6ac583bc94a1$export$41c562ebe57d11e2.event(n21) : n21);
}
function $d5fc6ac583bc94a1$var$j(n22, u12, i9, t9, r9, o6, f5, e2, c1) {
    var s2, h2, v2, y1, p2, k1, b2, m2, _$g, x1, A2, P1 = u12.type;
    if (void 0 !== u12.constructor) return null;
    null != i9.__h && (c1 = i9.__h, e2 = u12.__e = i9.__e, u12.__h = null, o6 = [
        e2
    ]), (s2 = $d5fc6ac583bc94a1$export$41c562ebe57d11e2.__b) && s2(u12);
    try {
        n: if ("function" == typeof P1) {
            if (m2 = u12.props, _$g = (s2 = P1.contextType) && t9[s2.__c], x1 = s2 ? _$g ? _$g.props.value : s2.__ : t9, i9.__c ? b2 = (h2 = u12.__c = i9.__c).__ = h2.__E : ("prototype" in P1 && P1.prototype.render ? u12.__c = h2 = new P1(m2, x1) : (u12.__c = h2 = new $d5fc6ac583bc94a1$export$16fa2f45be04daa8(m2, x1), h2.constructor = P1, h2.render = $d5fc6ac583bc94a1$var$O), _$g && _$g.sub(h2), h2.props = m2, h2.state || (h2.state = {}), h2.context = x1, h2.__n = t9, v2 = h2.__d = !0, h2.__h = []), null == h2.__s && (h2.__s = h2.state), null != P1.getDerivedStateFromProps && (h2.__s == h2.state && (h2.__s = $d5fc6ac583bc94a1$var$a({}, h2.__s)), $d5fc6ac583bc94a1$var$a(h2.__s, P1.getDerivedStateFromProps(m2, h2.__s))), y1 = h2.props, p2 = h2.state, v2) null == P1.getDerivedStateFromProps && null != h2.componentWillMount && h2.componentWillMount(), null != h2.componentDidMount && h2.__h.push(h2.componentDidMount);
            else {
                if (null == P1.getDerivedStateFromProps && m2 !== y1 && null != h2.componentWillReceiveProps && h2.componentWillReceiveProps(m2, x1), !h2.__e && null != h2.shouldComponentUpdate && !1 === h2.shouldComponentUpdate(m2, h2.__s, x1) || u12.__v === i9.__v) {
                    h2.props = m2, h2.state = h2.__s, u12.__v !== i9.__v && (h2.__d = !1), h2.__v = u12, u12.__e = i9.__e, u12.__k = i9.__k, u12.__k.forEach(function(n23) {
                        n23 && (n23.__ = u12);
                    }), h2.__h.length && f5.push(h2);
                    break n;
                }
                null != h2.componentWillUpdate && h2.componentWillUpdate(m2, h2.__s, x1), null != h2.componentDidUpdate && h2.__h.push(function() {
                    h2.componentDidUpdate(y1, p2, k1);
                });
            }
            h2.context = x1, h2.props = m2, h2.state = h2.__s, (s2 = $d5fc6ac583bc94a1$export$41c562ebe57d11e2.__r) && s2(u12), h2.__d = !1, h2.__v = u12, h2.__P = n22, s2 = h2.render(h2.props, h2.state, h2.context), h2.state = h2.__s, null != h2.getChildContext && (t9 = $d5fc6ac583bc94a1$var$a($d5fc6ac583bc94a1$var$a({}, t9), h2.getChildContext())), v2 || null == h2.getSnapshotBeforeUpdate || (k1 = h2.getSnapshotBeforeUpdate(y1, p2)), A2 = null != s2 && s2.type === $d5fc6ac583bc94a1$export$ffb0004e005737fa && null == s2.key ? s2.props.children : s2, $d5fc6ac583bc94a1$var$w(n22, Array.isArray(A2) ? A2 : [
                A2
            ], u12, i9, t9, r9, o6, f5, e2, c1), h2.base = u12.__e, u12.__h = null, h2.__h.length && f5.push(h2), b2 && (h2.__E = h2.__ = null), h2.__e = !1;
        } else null == o6 && u12.__v === i9.__v ? (u12.__k = i9.__k, u12.__e = i9.__e) : u12.__e = $d5fc6ac583bc94a1$var$L(i9.__e, u12, i9, t9, r9, o6, f5, c1);
        (s2 = $d5fc6ac583bc94a1$export$41c562ebe57d11e2.diffed) && s2(u12);
    } catch (n24) {
        u12.__v = null, (c1 || null != o6) && (u12.__e = e2, u12.__h = !!c1, o6[o6.indexOf(e2)] = null), $d5fc6ac583bc94a1$export$41c562ebe57d11e2.__e(n24, u12, i9);
    }
}
function $d5fc6ac583bc94a1$var$z(n25, u13) {
    $d5fc6ac583bc94a1$export$41c562ebe57d11e2.__c && $d5fc6ac583bc94a1$export$41c562ebe57d11e2.__c(u13, n25), n25.some(function(u14) {
        try {
            n25 = u14.__h, u14.__h = [], n25.some(function(n26) {
                n26.call(u14);
            });
        } catch (n27) {
            $d5fc6ac583bc94a1$export$41c562ebe57d11e2.__e(n27, u14.__v);
        }
    });
}
function $d5fc6ac583bc94a1$var$L(l16, u15, i10, t10, r10, o7, f6, c2) {
    var s3, a2, v3, y2 = i10.props, p3 = u15.props, _$d = u15.type, _$_ = 0;
    if ("svg" === _$d && (r10 = !0), null != o7) {
        for(; _$_ < o7.length; _$_++)if ((s3 = o7[_$_]) && "setAttribute" in s3 == !!_$d && (_$d ? s3.localName === _$d : 3 === s3.nodeType)) {
            l16 = s3, o7[_$_] = null;
            break;
        }
    }
    if (null == l16) {
        if (null === _$d) return document.createTextNode(p3);
        l16 = r10 ? document.createElementNS("http://www.w3.org/2000/svg", _$d) : document.createElement(_$d, p3.is && p3), o7 = null, c2 = !1;
    }
    if (null === _$d) y2 === p3 || c2 && l16.data === p3 || (l16.data = p3);
    else {
        if (o7 = o7 && $d5fc6ac583bc94a1$var$n.call(l16.childNodes), a2 = (y2 = i10.props || $d5fc6ac583bc94a1$var$e).dangerouslySetInnerHTML, v3 = p3.dangerouslySetInnerHTML, !c2) {
            if (null != o7) for(y2 = {}, _$_ = 0; _$_ < l16.attributes.length; _$_++)y2[l16.attributes[_$_].name] = l16.attributes[_$_].value;
            (v3 || a2) && (v3 && (a2 && v3.__html == a2.__html || v3.__html === l16.innerHTML) || (l16.innerHTML = v3 && v3.__html || ""));
        }
        if ($d5fc6ac583bc94a1$var$C(l16, p3, y2, r10, c2), v3) u15.__k = [];
        else if (_$_ = u15.props.children, $d5fc6ac583bc94a1$var$w(l16, Array.isArray(_$_) ? _$_ : [
            _$_
        ], u15, i10, t10, r10 && "foreignObject" !== _$d, o7, f6, o7 ? o7[0] : i10.__k && $d5fc6ac583bc94a1$var$k(i10, 0), c2), null != o7) for(_$_ = o7.length; _$_--;)null != o7[_$_] && $d5fc6ac583bc94a1$var$h(o7[_$_]);
        c2 || ("value" in p3 && void 0 !== (_$_ = p3.value) && (_$_ !== y2.value || _$_ !== l16.value || "progress" === _$d && !_$_) && $d5fc6ac583bc94a1$var$H(l16, "value", _$_, y2.value, !1), "checked" in p3 && void 0 !== (_$_ = p3.checked) && _$_ !== l16.checked && $d5fc6ac583bc94a1$var$H(l16, "checked", _$_, y2.checked, !1));
    }
    return l16;
}
function $d5fc6ac583bc94a1$var$M(n28, u16, i11) {
    try {
        "function" == typeof n28 ? n28(u16) : n28.current = u16;
    } catch (n29) {
        $d5fc6ac583bc94a1$export$41c562ebe57d11e2.__e(n29, i11);
    }
}
function $d5fc6ac583bc94a1$var$N(n30, u17, i12) {
    var t11, r11;
    if ($d5fc6ac583bc94a1$export$41c562ebe57d11e2.unmount && $d5fc6ac583bc94a1$export$41c562ebe57d11e2.unmount(n30), (t11 = n30.ref) && (t11.current && t11.current !== n30.__e || $d5fc6ac583bc94a1$var$M(t11, null, u17)), null != (t11 = n30.__c)) {
        if (t11.componentWillUnmount) try {
            t11.componentWillUnmount();
        } catch (n31) {
            $d5fc6ac583bc94a1$export$41c562ebe57d11e2.__e(n31, u17);
        }
        t11.base = t11.__P = null;
    }
    if (t11 = n30.__k) for(r11 = 0; r11 < t11.length; r11++)t11[r11] && $d5fc6ac583bc94a1$var$N(t11[r11], u17, "function" != typeof n30.type);
    i12 || null == n30.__e || $d5fc6ac583bc94a1$var$h(n30.__e), n30.__e = n30.__d = void 0;
}
function $d5fc6ac583bc94a1$var$O(n32, l, u18) {
    return this.constructor(n32, u18);
}
function $d5fc6ac583bc94a1$export$b3890eb0ae9dca99(u19, i13, t12) {
    var r12, o8, f7;
    $d5fc6ac583bc94a1$export$41c562ebe57d11e2.__ && $d5fc6ac583bc94a1$export$41c562ebe57d11e2.__(u19, i13), o8 = (r12 = "function" == typeof t12) ? null : t12 && t12.__k || i13.__k, f7 = [], $d5fc6ac583bc94a1$var$j(i13, u19 = (!r12 && t12 || i13).__k = $d5fc6ac583bc94a1$export$c8a8987d4410bf2d($d5fc6ac583bc94a1$export$ffb0004e005737fa, null, [
        u19
    ]), o8 || $d5fc6ac583bc94a1$var$e, $d5fc6ac583bc94a1$var$e, void 0 !== i13.ownerSVGElement, !r12 && t12 ? [
        t12
    ] : o8 ? null : i13.firstChild ? $d5fc6ac583bc94a1$var$n.call(i13.childNodes) : null, f7, !r12 && t12 ? t12 : o8 ? o8.__e : i13.firstChild, r12), $d5fc6ac583bc94a1$var$z(f7, u19);
}
function $d5fc6ac583bc94a1$export$fa8d919ba61d84db(n33, l17) {
    $d5fc6ac583bc94a1$export$b3890eb0ae9dca99(n33, l17, $d5fc6ac583bc94a1$export$fa8d919ba61d84db);
}
function $d5fc6ac583bc94a1$export$e530037191fcd5d7(l18, u20, i14) {
    var t13, r13, o9, f8 = $d5fc6ac583bc94a1$var$a({}, l18.props);
    for(o9 in u20)"key" == o9 ? t13 = u20[o9] : "ref" == o9 ? r13 = u20[o9] : f8[o9] = u20[o9];
    return arguments.length > 2 && (f8.children = arguments.length > 3 ? $d5fc6ac583bc94a1$var$n.call(arguments, 2) : i14), $d5fc6ac583bc94a1$var$y(l18.type, f8, t13 || l18.key, r13 || l18.ref, null);
}
function $d5fc6ac583bc94a1$export$fd42f52fd3ae1109(n34, l19) {
    var u21 = {
        __c: l19 = "__cC" + $d5fc6ac583bc94a1$var$f++,
        __: n34,
        Consumer: function Consumer(n35, l20) {
            return n35.children(l20);
        },
        Provider: function Provider(n36) {
            var u22, i15;
            return this.getChildContext || (u22 = [], (i15 = {})[l19] = this, this.getChildContext = function() {
                return i15;
            }, this.shouldComponentUpdate = function(n37) {
                this.props.value !== n37.value && u22.some($d5fc6ac583bc94a1$var$m);
            }, this.sub = function(n38) {
                u22.push(n38);
                var _$l = n38.componentWillUnmount;
                n38.componentWillUnmount = function() {
                    u22.splice(u22.indexOf(n38), 1), _$l && _$l.call(n38);
                };
            }), n36.children;
        }
    };
    return u21.Provider.__ = u21.Consumer.contextType = u21;
}
$d5fc6ac583bc94a1$var$n = $d5fc6ac583bc94a1$var$c.slice, $d5fc6ac583bc94a1$export$41c562ebe57d11e2 = {
    __e: function __e(n39, l21) {
        for(var u23, i16, t14; l21 = l21.__;)if ((u23 = l21.__c) && !u23.__) try {
            if ((i16 = u23.constructor) && null != i16.getDerivedStateFromError && (u23.setState(i16.getDerivedStateFromError(n39)), t14 = u23.__d), null != u23.componentDidCatch && (u23.componentDidCatch(n39), t14 = u23.__d), t14) return u23.__E = u23;
        } catch (l22) {
            n39 = l22;
        }
        throw n39;
    }
}, $d5fc6ac583bc94a1$var$u = 0, $d5fc6ac583bc94a1$export$a8257692ac88316c = function i(n40) {
    return null != n40 && void 0 === n40.constructor;
}, $d5fc6ac583bc94a1$export$16fa2f45be04daa8.prototype.setState = function(n41, l23) {
    var u24;
    u24 = null != this.__s && this.__s !== this.state ? this.__s : this.__s = $d5fc6ac583bc94a1$var$a({}, this.state), "function" == typeof n41 && (n41 = n41($d5fc6ac583bc94a1$var$a({}, u24), this.props)), n41 && $d5fc6ac583bc94a1$var$a(u24, n41), null != n41 && this.__v && (l23 && this.__h.push(l23), $d5fc6ac583bc94a1$var$m(this));
}, $d5fc6ac583bc94a1$export$16fa2f45be04daa8.prototype.forceUpdate = function(n42) {
    this.__v && (this.__e = !0, n42 && this.__h.push(n42), $d5fc6ac583bc94a1$var$m(this));
}, $d5fc6ac583bc94a1$export$16fa2f45be04daa8.prototype.render = $d5fc6ac583bc94a1$export$ffb0004e005737fa, $d5fc6ac583bc94a1$var$t = [], $d5fc6ac583bc94a1$var$r = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, $d5fc6ac583bc94a1$var$g.__r = 0, $d5fc6ac583bc94a1$var$f = 0;



var $55ec52987511209e$var$o = 0;
function $55ec52987511209e$export$34b9dba7ce09269b(_1, e1, n, t, f) {
    var l, s, u = {};
    for(s in e1)"ref" == s ? l = e1[s] : u[s] = e1[s];
    var a = {
        type: _1,
        props: u,
        key: n,
        ref: l,
        __k: null,
        __: null,
        __b: 0,
        __e: null,
        __d: void 0,
        __c: null,
        __h: null,
        constructor: void 0,
        __v: --$55ec52987511209e$var$o,
        __source: t,
        __self: f
    };
    if ("function" == typeof _1 && (l = _1.defaultProps)) for(s in l)void 0 === u[s] && (u[s] = l[s]);
    return (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).vnode && (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).vnode(a), a;
}






function $000e3cabb83607f9$var$set(key, value) {
    try {
        window.localStorage["emoji-mart.".concat(key)] = JSON.stringify(value);
    } catch (error) {}
}
function $000e3cabb83607f9$var$get(key) {
    try {
        var value = window.localStorage["emoji-mart.".concat(key)];
        if (value) return JSON.parse(value);
    } catch (error) {}
}
var $000e3cabb83607f9$export$2e2bcd8739ae039 = {
    set: $000e3cabb83607f9$var$set,
    get: $000e3cabb83607f9$var$get
};


var $551eac79ded07bc8$var$CACHE = new Map();
var $551eac79ded07bc8$var$VERSIONS = [
    {
        v: 15,
        emoji: "\uD83E\uDEE8"
    },
    {
        v: 14,
        emoji: "\uD83E\uDEE0"
    },
    {
        v: 13.1,
        emoji: "\uD83D\uDE36\u200D\uD83C\uDF2B\uFE0F"
    },
    {
        v: 13,
        emoji: "\uD83E\uDD78"
    },
    {
        v: 12.1,
        emoji: "\uD83E\uDDD1\u200D\uD83E\uDDB0"
    },
    {
        v: 12,
        emoji: "\uD83E\uDD71"
    },
    {
        v: 11,
        emoji: "\uD83E\uDD70"
    },
    {
        v: 5,
        emoji: "\uD83E\uDD29"
    },
    {
        v: 4,
        emoji: "\uD83D\uDC71\u200D\u2640\uFE0F"
    },
    {
        v: 3,
        emoji: "\uD83E\uDD23"
    },
    {
        v: 2,
        emoji: "\uD83D\uDC4B\uD83C\uDFFB"
    },
    {
        v: 1,
        emoji: "\uD83D\uDE43"
    }, 
];
function $551eac79ded07bc8$var$latestVersion() {
    var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
    try {
        for(var _iterator = $551eac79ded07bc8$var$VERSIONS[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
            var _value = _step.value, v = _value.v, emoji = _value.emoji;
            if ($551eac79ded07bc8$var$isSupported(emoji)) return v;
        }
    } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
    } finally{
        try {
            if (!_iteratorNormalCompletion && _iterator.return != null) {
                _iterator.return();
            }
        } finally{
            if (_didIteratorError) {
                throw _iteratorError;
            }
        }
    }
}
function $551eac79ded07bc8$var$noCountryFlags() {
    if ($551eac79ded07bc8$var$isSupported("\uD83C\uDDE8\uD83C\uDDE6")) return false;
    return true;
}
function $551eac79ded07bc8$var$isSupported(emoji) {
    if ($551eac79ded07bc8$var$CACHE.has(emoji)) return $551eac79ded07bc8$var$CACHE.get(emoji);
    var supported = $551eac79ded07bc8$var$isEmojiSupported(emoji);
    $551eac79ded07bc8$var$CACHE.set(emoji, supported);
    return supported;
}
// https://github.com/koala-interactive/is-emoji-supported
var $551eac79ded07bc8$var$isEmojiSupported = function() {
    var ctx = null;
    try {
        if (!navigator.userAgent.includes("jsdom")) ctx = document.createElement("canvas").getContext("2d", {
            willReadFrequently: true
        });
    } catch (e) {}
    // Not in browser env
    if (!ctx) return function() {
        return false;
    };
    var CANVAS_HEIGHT = 25;
    var CANVAS_WIDTH = 20;
    var textSize = Math.floor(CANVAS_HEIGHT / 2);
    // Initialize convas context
    ctx.font = textSize + "px Arial, Sans-Serif";
    ctx.textBaseline = "top";
    ctx.canvas.width = CANVAS_WIDTH * 2;
    ctx.canvas.height = CANVAS_HEIGHT;
    return function(unicode) {
        ctx.clearRect(0, 0, CANVAS_WIDTH * 2, CANVAS_HEIGHT);
        // Draw in red on the left
        ctx.fillStyle = "#FF0000";
        ctx.fillText(unicode, 0, 22);
        // Draw in blue on right
        ctx.fillStyle = "#0000FF";
        ctx.fillText(unicode, CANVAS_WIDTH, 22);
        var a = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).data;
        var count = a.length;
        var i = 0;
        // Search the first visible pixel
        for(; i < count && !a[i + 3]; i += 4);
        // No visible pixel
        if (i >= count) return false;
        // Emoji has immutable color, so we check the color of the emoji in two different colors
        // the result show be the same.
        var x = CANVAS_WIDTH + i / 4 % CANVAS_WIDTH;
        var y = Math.floor(i / 4 / CANVAS_WIDTH);
        var b = ctx.getImageData(x, y, 1, 1).data;
        if (a[i] !== b[0] || a[i + 2] !== b[2]) return false;
        // Some emojis are a contraction of different ones, so if it's not
        // supported, it will show multiple characters
        if (ctx.measureText(unicode).width >= CANVAS_WIDTH) return false;
        // Supported
        return true;
    };
}();
var $551eac79ded07bc8$export$2e2bcd8739ae039 = {
    latestVersion: $551eac79ded07bc8$var$latestVersion,
    noCountryFlags: $551eac79ded07bc8$var$noCountryFlags
};



var $79925e24c549250c$var$DEFAULTS = [
    "+1",
    "grinning",
    "kissing_heart",
    "heart_eyes",
    "laughing",
    "stuck_out_tongue_winking_eye",
    "sweat_smile",
    "joy",
    "scream",
    "disappointed",
    "unamused",
    "weary",
    "sob",
    "sunglasses",
    "heart", 
];
var $79925e24c549250c$var$Index = null;
function $79925e24c549250c$var$add(emoji) {
    $79925e24c549250c$var$Index || ($79925e24c549250c$var$Index = (0, $000e3cabb83607f9$export$2e2bcd8739ae039).get("frequently") || {});
    var emojiId = emoji.id || emoji;
    if (!emojiId) return;
    $79925e24c549250c$var$Index[emojiId] || ($79925e24c549250c$var$Index[emojiId] = 0);
    $79925e24c549250c$var$Index[emojiId] += 1;
    (0, $000e3cabb83607f9$export$2e2bcd8739ae039).set("last", emojiId);
    (0, $000e3cabb83607f9$export$2e2bcd8739ae039).set("frequently", $79925e24c549250c$var$Index);
}
function $79925e24c549250c$var$get(param) {
    var maxFrequentRows = param.maxFrequentRows, perLine = param.perLine;
    if (!maxFrequentRows) return [];
    $79925e24c549250c$var$Index || ($79925e24c549250c$var$Index = (0, $000e3cabb83607f9$export$2e2bcd8739ae039).get("frequently"));
    var emojiIds = [];
    if (!$79925e24c549250c$var$Index) {
        $79925e24c549250c$var$Index = {};
        for(var i in $79925e24c549250c$var$DEFAULTS.slice(0, perLine)){
            var emojiId = $79925e24c549250c$var$DEFAULTS[i];
            $79925e24c549250c$var$Index[emojiId] = perLine - i;
            emojiIds.push(emojiId);
        }
        return emojiIds;
    }
    var max = maxFrequentRows * perLine;
    var last = (0, $000e3cabb83607f9$export$2e2bcd8739ae039).get("last");
    for(var emojiId1 in $79925e24c549250c$var$Index)emojiIds.push(emojiId1);
    emojiIds.sort(function(a, b) {
        var aScore = $79925e24c549250c$var$Index[b];
        var bScore = $79925e24c549250c$var$Index[a];
        if (aScore == bScore) return a.localeCompare(b);
        return aScore - bScore;
    });
    if (emojiIds.length > max) {
        var removedIds = emojiIds.slice(max);
        emojiIds = emojiIds.slice(0, max);
        var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
        try {
            for(var _iterator = removedIds[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                var removedId = _step.value;
                if (removedId == last) continue;
                delete $79925e24c549250c$var$Index[removedId];
            }
        } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
        } finally{
            try {
                if (!_iteratorNormalCompletion && _iterator.return != null) {
                    _iterator.return();
                }
            } finally{
                if (_didIteratorError) {
                    throw _iteratorError;
                }
            }
        }
        if (last && emojiIds.indexOf(last) == -1) {
            delete $79925e24c549250c$var$Index[emojiIds[emojiIds.length - 1]];
            emojiIds.splice(-1, 1, last);
        }
        (0, $000e3cabb83607f9$export$2e2bcd8739ae039).set("frequently", $79925e24c549250c$var$Index);
    }
    return emojiIds;
}
var $79925e24c549250c$export$2e2bcd8739ae039 = {
    add: $79925e24c549250c$var$add,
    get: $79925e24c549250c$var$get,
    DEFAULTS: $79925e24c549250c$var$DEFAULTS
};







var $hdvdM = parcelRequire("hdvdM");

var $128a97276525cf7f$exports = {};
$128a97276525cf7f$exports = JSON.parse('{"search":"Search","search_no_results_1":"Oh no!","search_no_results_2":"That emoji couldn\u2019t be found","pick":"Pick an emoji\u2026","add_custom":"Add custom emoji","categories":{"activity":"Activity","custom":"Custom","flags":"Flags","foods":"Food & Drink","frequent":"Frequently used","nature":"Animals & Nature","objects":"Objects","people":"Smileys & People","places":"Travel & Places","search":"Search Results","symbols":"Symbols"},"skins":{"1":"Default","2":"Light","3":"Medium-Light","4":"Medium","5":"Medium-Dark","6":"Dark","choose":"Choose default skin tone"}}');


var $f39d0d696aba82c3$export$2e2bcd8739ae039 = {
    autoFocus: {
        value: false
    },
    dynamicWidth: {
        value: false
    },
    emojiButtonColors: {
        value: null
    },
    emojiButtonRadius: {
        value: "100%"
    },
    emojiButtonSize: {
        value: 36
    },
    emojiSize: {
        value: 24
    },
    emojiVersion: {
        value: 15,
        choices: [
            1,
            2,
            3,
            4,
            5,
            11,
            12,
            12.1,
            13,
            13.1,
            14,
            15
        ]
    },
    exceptEmojis: {
        value: []
    },
    icons: {
        value: "auto",
        choices: [
            "auto",
            "outline",
            "solid"
        ]
    },
    locale: {
        value: "en",
        choices: [
            "en",
            "ar",
            "be",
            "cs",
            "de",
            "es",
            "fa",
            "fi",
            "fr",
            "hi",
            "it",
            "ja",
            "ko",
            "nl",
            "pl",
            "pt",
            "ru",
            "sa",
            "tr",
            "uk",
            "vi",
            "zh", 
        ]
    },
    maxFrequentRows: {
        value: 4
    },
    navPosition: {
        value: "top",
        choices: [
            "top",
            "bottom",
            "none"
        ]
    },
    noCountryFlags: {
        value: false
    },
    noResultsEmoji: {
        value: null
    },
    perLine: {
        value: 9
    },
    previewEmoji: {
        value: null
    },
    previewPosition: {
        value: "bottom",
        choices: [
            "top",
            "bottom",
            "none"
        ]
    },
    searchPosition: {
        value: "sticky",
        choices: [
            "sticky",
            "static",
            "none"
        ]
    },
    set: {
        value: "native",
        choices: [
            "native",
            "apple",
            "facebook",
            "google",
            "twitter"
        ]
    },
    skin: {
        value: 1,
        choices: [
            1,
            2,
            3,
            4,
            5,
            6
        ]
    },
    skinTonePosition: {
        value: "preview",
        choices: [
            "preview",
            "search",
            "none"
        ]
    },
    theme: {
        value: "auto",
        choices: [
            "auto",
            "light",
            "dark"
        ]
    },
    // Data
    categories: null,
    categoryIcons: null,
    custom: null,
    data: null,
    i18n: null,
    // Callbacks
    getImageURL: null,
    getSpritesheetURL: null,
    onAddCustomEmoji: null,
    onClickOutside: null,
    onEmojiSelect: null,
    // Deprecated
    stickySearch: {
        deprecated: true,
        value: true
    }
};



var $47b4a70d4572a3b3$export$dbe3113d60765c1a = null;
var $47b4a70d4572a3b3$export$2d0294657ab35f1b = null;
var $47b4a70d4572a3b3$var$fetchCache = {};
function $47b4a70d4572a3b3$var$fetchJSON(src) {
    return $47b4a70d4572a3b3$var$_fetchJSON.apply(this, arguments);
}
function $47b4a70d4572a3b3$var$_fetchJSON() {
    $47b4a70d4572a3b3$var$_fetchJSON = (0, (/*@__PURE__*/$parcel$interopDefault($f653aaea2ce76311$exports)))((0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).mark(function _callee(src) {
        var response, json;
        return (0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).wrap(function _callee$(_ctx) {
            while(1)switch(_ctx.prev = _ctx.next){
                case 0:
                    if (!$47b4a70d4572a3b3$var$fetchCache[src]) {
                        _ctx.next = 2;
                        break;
                    }
                    return _ctx.abrupt("return", $47b4a70d4572a3b3$var$fetchCache[src]);
                case 2:
                    _ctx.next = 4;
                    return fetch(src);
                case 4:
                    response = _ctx.sent;
                    _ctx.next = 7;
                    return response.json();
                case 7:
                    json = _ctx.sent;
                    $47b4a70d4572a3b3$var$fetchCache[src] = json;
                    return _ctx.abrupt("return", json);
                case 10:
                case "end":
                    return _ctx.stop();
            }
        }, _callee);
    }));
    return $47b4a70d4572a3b3$var$_fetchJSON.apply(this, arguments);
}
var $47b4a70d4572a3b3$var$promise = null;
var $47b4a70d4572a3b3$var$initiated = false;
var $47b4a70d4572a3b3$var$initCallback = null;
var $47b4a70d4572a3b3$var$initialized = false;
function $47b4a70d4572a3b3$export$2cd8252107eb640b(options) {
    var caller = (arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {}).caller;
    $47b4a70d4572a3b3$var$promise || ($47b4a70d4572a3b3$var$promise = new Promise(function(resolve) {
        $47b4a70d4572a3b3$var$initCallback = resolve;
    }));
    if (options) $47b4a70d4572a3b3$var$_init(options);
    else if (caller && !$47b4a70d4572a3b3$var$initialized) console.warn("`".concat(caller, "` requires data to be initialized first. Promise will be pending until `init` is called."));
    return $47b4a70d4572a3b3$var$promise;
}
function $47b4a70d4572a3b3$var$_init(props) {
    return $47b4a70d4572a3b3$var$__init.apply(this, arguments);
}
function $47b4a70d4572a3b3$var$__init() {
    $47b4a70d4572a3b3$var$__init = (0, (/*@__PURE__*/$parcel$interopDefault($f653aaea2ce76311$exports)))((0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).mark(function _callee(props) {
        var emojiVersion, set, locale, alias, emojiId, emoji, i, category, prevCategory, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, emoji1, latestVersionSupport, noCountryFlags, categoryIndex, resetSearchIndex, category1, maxFrequentRows, perLine, categoryIcons, icon, emojiIndex, emojiId1, emoji2, ignore, _iteratorNormalCompletion1, _didIteratorError1, _iteratorError1, _iterator1, _step1, emoticon, skinIndex, _iteratorNormalCompletion2, _didIteratorError2, _iteratorError2, _iterator2, _step2, skin, native, skinShortcodes;
        return (0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).wrap(function _callee$(_ctx) {
            while(1)switch(_ctx.prev = _ctx.next){
                case 0:
                    $47b4a70d4572a3b3$var$initialized = true;
                    emojiVersion = props.emojiVersion, set = props.set, locale = props.locale;
                    emojiVersion || (emojiVersion = (0, $f39d0d696aba82c3$export$2e2bcd8739ae039).emojiVersion.value);
                    set || (set = (0, $f39d0d696aba82c3$export$2e2bcd8739ae039).set.value);
                    locale || (locale = (0, $f39d0d696aba82c3$export$2e2bcd8739ae039).locale.value);
                    if ($47b4a70d4572a3b3$export$2d0294657ab35f1b) {
                        _ctx.next = 36;
                        break;
                    }
                    if (!(typeof props.data === "function")) {
                        _ctx.next = 12;
                        break;
                    }
                    _ctx.next = 9;
                    return props.data();
                case 9:
                    _ctx.t1 = _ctx.sent;
                    _ctx.next = 13;
                    break;
                case 12:
                    _ctx.t1 = props.data;
                case 13:
                    _ctx.t0 = _ctx.t1;
                    if (_ctx.t0) {
                        _ctx.next = 18;
                        break;
                    }
                    _ctx.next = 17;
                    return $47b4a70d4572a3b3$var$fetchJSON("https://cdn.jsdelivr.net/npm/@emoji-mart/data@latest/sets/".concat(emojiVersion, "/").concat(set, ".json"));
                case 17:
                    _ctx.t0 = _ctx.sent;
                case 18:
                    $47b4a70d4572a3b3$export$2d0294657ab35f1b = _ctx.t0;
                    $47b4a70d4572a3b3$export$2d0294657ab35f1b.emoticons = {};
                    $47b4a70d4572a3b3$export$2d0294657ab35f1b.natives = {};
                    $47b4a70d4572a3b3$export$2d0294657ab35f1b.categories.unshift({
                        id: "frequent",
                        emojis: []
                    });
                    _ctx.t2 = regeneratorRuntime.keys($47b4a70d4572a3b3$export$2d0294657ab35f1b.aliases);
                case 23:
                    if ((_ctx.t3 = _ctx.t2()).done) {
                        _ctx.next = 33;
                        break;
                    }
                    alias = _ctx.t3.value;
                    emojiId = $47b4a70d4572a3b3$export$2d0294657ab35f1b.aliases[alias];
                    emoji = $47b4a70d4572a3b3$export$2d0294657ab35f1b.emojis[emojiId];
                    if (emoji) {
                        _ctx.next = 29;
                        break;
                    }
                    return _ctx.abrupt("continue", 23);
                case 29:
                    emoji.aliases || (emoji.aliases = []);
                    emoji.aliases.push(alias);
                    _ctx.next = 23;
                    break;
                case 33:
                    $47b4a70d4572a3b3$export$2d0294657ab35f1b.originalCategories = $47b4a70d4572a3b3$export$2d0294657ab35f1b.categories;
                    _ctx.next = 37;
                    break;
                case 36:
                    $47b4a70d4572a3b3$export$2d0294657ab35f1b.categories = $47b4a70d4572a3b3$export$2d0294657ab35f1b.categories.filter(function(c) {
                        var isCustom = !!c.name;
                        if (!isCustom) return true;
                        return false;
                    });
                case 37:
                    if (!(typeof props.i18n === "function")) {
                        _ctx.next = 43;
                        break;
                    }
                    _ctx.next = 40;
                    return props.i18n();
                case 40:
                    _ctx.t5 = _ctx.sent;
                    _ctx.next = 44;
                    break;
                case 43:
                    _ctx.t5 = props.i18n;
                case 44:
                    _ctx.t4 = _ctx.t5;
                    if (_ctx.t4) {
                        _ctx.next = 54;
                        break;
                    }
                    if (!(locale == "en")) {
                        _ctx.next = 50;
                        break;
                    }
                    _ctx.t6 = (0, (/*@__PURE__*/$parcel$interopDefault($128a97276525cf7f$exports)));
                    _ctx.next = 53;
                    break;
                case 50:
                    _ctx.next = 52;
                    return $47b4a70d4572a3b3$var$fetchJSON("https://cdn.jsdelivr.net/npm/@emoji-mart/data@latest/i18n/".concat(locale, ".json"));
                case 52:
                    _ctx.t6 = _ctx.sent;
                case 53:
                    _ctx.t4 = _ctx.t6;
                case 54:
                    $47b4a70d4572a3b3$export$dbe3113d60765c1a = _ctx.t4;
                    if (!props.custom) {
                        _ctx.next = 87;
                        break;
                    }
                    _ctx.t7 = regeneratorRuntime.keys(props.custom);
                case 57:
                    if ((_ctx.t8 = _ctx.t7()).done) {
                        _ctx.next = 87;
                        break;
                    }
                    i = _ctx.t8.value;
                    i = parseInt(i);
                    category = props.custom[i];
                    prevCategory = props.custom[i - 1];
                    if (!(!category.emojis || !category.emojis.length)) {
                        _ctx.next = 64;
                        break;
                    }
                    return _ctx.abrupt("continue", 57);
                case 64:
                    category.id || (category.id = "custom_".concat(i + 1));
                    category.name || (category.name = $47b4a70d4572a3b3$export$dbe3113d60765c1a.categories.custom);
                    if (prevCategory && !category.icon) category.target = prevCategory.target || prevCategory;
                    $47b4a70d4572a3b3$export$2d0294657ab35f1b.categories.push(category);
                    _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    _ctx.prev = 69;
                    for(_iterator = category.emojis[Symbol.iterator](); !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                        emoji1 = _step.value;
                        $47b4a70d4572a3b3$export$2d0294657ab35f1b.emojis[emoji1.id] = emoji1;
                    }
                    _ctx.next = 77;
                    break;
                case 73:
                    _ctx.prev = 73;
                    _ctx.t9 = _ctx["catch"](69);
                    _didIteratorError = true;
                    _iteratorError = _ctx.t9;
                case 77:
                    _ctx.prev = 77;
                    _ctx.prev = 78;
                    if (!_iteratorNormalCompletion && _iterator.return != null) {
                        _iterator.return();
                    }
                case 80:
                    _ctx.prev = 80;
                    if (!_didIteratorError) {
                        _ctx.next = 83;
                        break;
                    }
                    throw _iteratorError;
                case 83:
                    return _ctx.finish(80);
                case 84:
                    return _ctx.finish(77);
                case 85:
                    _ctx.next = 57;
                    break;
                case 87:
                    if (props.categories) $47b4a70d4572a3b3$export$2d0294657ab35f1b.categories = $47b4a70d4572a3b3$export$2d0294657ab35f1b.originalCategories.filter(function(c) {
                        return props.categories.indexOf(c.id) != -1;
                    }).sort(function(c1, c2) {
                        var i1 = props.categories.indexOf(c1.id);
                        var i2 = props.categories.indexOf(c2.id);
                        return i1 - i2;
                    });
                    latestVersionSupport = null;
                    noCountryFlags = null;
                    if (set == "native") {
                        latestVersionSupport = (0, $551eac79ded07bc8$export$2e2bcd8739ae039).latestVersion();
                        noCountryFlags = props.noCountryFlags || (0, $551eac79ded07bc8$export$2e2bcd8739ae039).noCountryFlags();
                    }
                    categoryIndex = $47b4a70d4572a3b3$export$2d0294657ab35f1b.categories.length;
                    resetSearchIndex = false;
                case 93:
                    if (!categoryIndex--) {
                        _ctx.next = 179;
                        break;
                    }
                    category1 = $47b4a70d4572a3b3$export$2d0294657ab35f1b.categories[categoryIndex];
                    if (category1.id == "frequent") {
                        maxFrequentRows = props.maxFrequentRows, perLine = props.perLine;
                        maxFrequentRows = maxFrequentRows >= 0 ? maxFrequentRows : (0, $f39d0d696aba82c3$export$2e2bcd8739ae039).maxFrequentRows.value;
                        perLine || (perLine = (0, $f39d0d696aba82c3$export$2e2bcd8739ae039).perLine.value);
                        category1.emojis = (0, $79925e24c549250c$export$2e2bcd8739ae039).get({
                            maxFrequentRows: maxFrequentRows,
                            perLine: perLine
                        });
                    }
                    if (!(!category1.emojis || !category1.emojis.length)) {
                        _ctx.next = 99;
                        break;
                    }
                    $47b4a70d4572a3b3$export$2d0294657ab35f1b.categories.splice(categoryIndex, 1);
                    return _ctx.abrupt("continue", 93);
                case 99:
                    categoryIcons = props.categoryIcons;
                    if (categoryIcons) {
                        icon = categoryIcons[category1.id];
                        if (icon && !category1.icon) category1.icon = icon;
                    }
                    emojiIndex = category1.emojis.length;
                case 102:
                    if (!emojiIndex--) {
                        _ctx.next = 177;
                        break;
                    }
                    emojiId1 = category1.emojis[emojiIndex];
                    emoji2 = emojiId1.id ? emojiId1 : $47b4a70d4572a3b3$export$2d0294657ab35f1b.emojis[emojiId1];
                    ignore = function() {
                        category1.emojis.splice(emojiIndex, 1);
                    };
                    if (!(!emoji2 || props.exceptEmojis && props.exceptEmojis.includes(emoji2.id))) {
                        _ctx.next = 109;
                        break;
                    }
                    ignore();
                    return _ctx.abrupt("continue", 102);
                case 109:
                    if (!(latestVersionSupport && emoji2.version > latestVersionSupport)) {
                        _ctx.next = 112;
                        break;
                    }
                    ignore();
                    return _ctx.abrupt("continue", 102);
                case 112:
                    if (!(noCountryFlags && category1.id == "flags")) {
                        _ctx.next = 116;
                        break;
                    }
                    if ((0, $fc6326626d221acf$export$bcb25aa587e9cb13).includes(emoji2.id)) {
                        _ctx.next = 116;
                        break;
                    }
                    ignore();
                    return _ctx.abrupt("continue", 102);
                case 116:
                    if (emoji2.search) {
                        _ctx.next = 175;
                        break;
                    }
                    resetSearchIndex = true;
                    emoji2.search = "," + [
                        [
                            emoji2.id,
                            false
                        ],
                        [
                            emoji2.name,
                            true
                        ],
                        [
                            emoji2.keywords,
                            false
                        ],
                        [
                            emoji2.emoticons,
                            false
                        ], 
                    ].map(function(param) {
                        var _param = (0, (/*@__PURE__*/$parcel$interopDefault($f521ef7da5d46cb0$exports)))(param, 2), strings = _param[0], split = _param[1];
                        if (!strings) return;
                        return (Array.isArray(strings) ? strings : [
                            strings
                        ]).map(function(string) {
                            return (split ? string.split(/[-|_|\s]+/) : [
                                string
                            ]).map(function(s) {
                                return s.toLowerCase();
                            });
                        }).flat();
                    }).flat().filter(function(a) {
                        return a && a.trim();
                    }).join(",");
                    _iteratorNormalCompletion1 = true, _didIteratorError1 = false, _iteratorError1 = undefined;
                    if (!emoji2.emoticons) {
                        _ctx.next = 145;
                        break;
                    }
                    _ctx.prev = 121;
                    _iterator1 = emoji2.emoticons[Symbol.iterator]();
                case 123:
                    if (_iteratorNormalCompletion1 = (_step1 = _iterator1.next()).done) {
                        _ctx.next = 131;
                        break;
                    }
                    emoticon = _step1.value;
                    if (!$47b4a70d4572a3b3$export$2d0294657ab35f1b.emoticons[emoticon]) {
                        _ctx.next = 127;
                        break;
                    }
                    return _ctx.abrupt("continue", 128);
                case 127:
                    $47b4a70d4572a3b3$export$2d0294657ab35f1b.emoticons[emoticon] = emoji2.id;
                case 128:
                    _iteratorNormalCompletion1 = true;
                    _ctx.next = 123;
                    break;
                case 131:
                    _ctx.next = 137;
                    break;
                case 133:
                    _ctx.prev = 133;
                    _ctx.t10 = _ctx["catch"](121);
                    _didIteratorError1 = true;
                    _iteratorError1 = _ctx.t10;
                case 137:
                    _ctx.prev = 137;
                    _ctx.prev = 138;
                    if (!_iteratorNormalCompletion1 && _iterator1.return != null) {
                        _iterator1.return();
                    }
                case 140:
                    _ctx.prev = 140;
                    if (!_didIteratorError1) {
                        _ctx.next = 143;
                        break;
                    }
                    throw _iteratorError1;
                case 143:
                    return _ctx.finish(140);
                case 144:
                    return _ctx.finish(137);
                case 145:
                    skinIndex = 0;
                    _iteratorNormalCompletion2 = true, _didIteratorError2 = false, _iteratorError2 = undefined;
                    _ctx.prev = 147;
                    _iterator2 = emoji2.skins[Symbol.iterator]();
                case 149:
                    if (_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done) {
                        _ctx.next = 161;
                        break;
                    }
                    skin = _step2.value;
                    if (skin) {
                        _ctx.next = 153;
                        break;
                    }
                    return _ctx.abrupt("continue", 158);
                case 153:
                    skinIndex++;
                    native = skin.native;
                    if (native) {
                        $47b4a70d4572a3b3$export$2d0294657ab35f1b.natives[native] = emoji2.id;
                        emoji2.search += ",".concat(native);
                    }
                    skinShortcodes = skinIndex == 1 ? "" : ":skin-tone-".concat(skinIndex, ":");
                    skin.shortcodes = ":".concat(emoji2.id, ":").concat(skinShortcodes);
                case 158:
                    _iteratorNormalCompletion2 = true;
                    _ctx.next = 149;
                    break;
                case 161:
                    _ctx.next = 167;
                    break;
                case 163:
                    _ctx.prev = 163;
                    _ctx.t11 = _ctx["catch"](147);
                    _didIteratorError2 = true;
                    _iteratorError2 = _ctx.t11;
                case 167:
                    _ctx.prev = 167;
                    _ctx.prev = 168;
                    if (!_iteratorNormalCompletion2 && _iterator2.return != null) {
                        _iterator2.return();
                    }
                case 170:
                    _ctx.prev = 170;
                    if (!_didIteratorError2) {
                        _ctx.next = 173;
                        break;
                    }
                    throw _iteratorError2;
                case 173:
                    return _ctx.finish(170);
                case 174:
                    return _ctx.finish(167);
                case 175:
                    _ctx.next = 102;
                    break;
                case 177:
                    _ctx.next = 93;
                    break;
                case 179:
                    if (resetSearchIndex) (0, $022b4a7de802d8eb$export$2e2bcd8739ae039).reset();
                    $47b4a70d4572a3b3$var$initCallback();
                case 181:
                case "end":
                    return _ctx.stop();
            }
        }, _callee, null, [
            [
                69,
                73,
                77,
                85
            ],
            [
                78,
                ,
                80,
                84
            ],
            [
                121,
                133,
                137,
                145
            ],
            [
                138,
                ,
                140,
                144
            ],
            [
                147,
                163,
                167,
                175
            ],
            [
                168,
                ,
                170,
                174
            ]
        ]);
    }));
    return $47b4a70d4572a3b3$var$__init.apply(this, arguments);
}
function $47b4a70d4572a3b3$export$75fe5f91d452f94b(props, defaultProps, element) {
    props || (props = {});
    var _props = {};
    for(var k in defaultProps)_props[k] = $47b4a70d4572a3b3$export$88c9ddb45cea7241(k, props, defaultProps, element);
    return _props;
}
function $47b4a70d4572a3b3$export$88c9ddb45cea7241(propName, props, defaultProps, element) {
    var defaults = defaultProps[propName];
    var value = element && element.getAttribute(propName) || (props[propName] != null && props[propName] != undefined ? props[propName] : null);
    if (!defaults) return value;
    if (value != null && defaults.value && (0, (/*@__PURE__*/$parcel$interopDefault($hdvdM)))(defaults.value) != (typeof value === "undefined" ? "undefined" : (0, (/*@__PURE__*/$parcel$interopDefault($hdvdM)))(value))) {
        if (typeof defaults.value == "boolean") value = value == "false" ? false : true;
        else value = defaults.value.constructor(value);
    }
    if (defaults.transform && value) value = defaults.transform(value);
    if (value == null || defaults.choices && defaults.choices.indexOf(value) == -1) value = defaults.value;
    return value;
}


var $022b4a7de802d8eb$var$SHORTCODES_REGEX = /^(?:\:([^\:]+)\:)(?:\:skin-tone-(\d)\:)?$/;
var $022b4a7de802d8eb$var$Pool = null;
function $022b4a7de802d8eb$var$get(emojiId) {
    if (emojiId.id) return emojiId;
    return (0, $47b4a70d4572a3b3$export$2d0294657ab35f1b).emojis[emojiId] || (0, $47b4a70d4572a3b3$export$2d0294657ab35f1b).emojis[(0, $47b4a70d4572a3b3$export$2d0294657ab35f1b).aliases[emojiId]] || (0, $47b4a70d4572a3b3$export$2d0294657ab35f1b).emojis[(0, $47b4a70d4572a3b3$export$2d0294657ab35f1b).natives[emojiId]];
}
function $022b4a7de802d8eb$var$reset() {
    $022b4a7de802d8eb$var$Pool = null;
}
function $022b4a7de802d8eb$var$search(value) {
    return $022b4a7de802d8eb$var$_search.apply(this, arguments);
}
function $022b4a7de802d8eb$var$_search() {
    $022b4a7de802d8eb$var$_search = (0, (/*@__PURE__*/$parcel$interopDefault($f653aaea2ce76311$exports)))((0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).mark(function _callee(value) {
        var ref, maxResults, caller, values, pool, results, scores, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, value1, _iteratorNormalCompletion1, _didIteratorError1, _iteratorError1, _iterator1, _step1, emoji, score, _args = arguments;
        return (0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).wrap(function _callee$(_ctx) {
            while(1)switch(_ctx.prev = _ctx.next){
                case 0:
                    ref = _args.length > 1 && _args[1] !== void 0 ? _args[1] : {}, maxResults = ref.maxResults, caller = ref.caller;
                    if (!(!value || !value.trim().length)) {
                        _ctx.next = 3;
                        break;
                    }
                    return _ctx.abrupt("return", null);
                case 3:
                    maxResults || (maxResults = 90);
                    _ctx.next = 6;
                    return (0, $47b4a70d4572a3b3$export$2cd8252107eb640b)(null, {
                        caller: caller || "SearchIndex.search"
                    });
                case 6:
                    values = value.toLowerCase().replace(/(\w)-/, "$1 ").split(/[\s|,]+/).filter(function(word, i, words) {
                        return word.trim() && words.indexOf(word) == i;
                    });
                    if (values.length) {
                        _ctx.next = 9;
                        break;
                    }
                    return _ctx.abrupt("return");
                case 9:
                    pool = $022b4a7de802d8eb$var$Pool || ($022b4a7de802d8eb$var$Pool = Object.values((0, $47b4a70d4572a3b3$export$2d0294657ab35f1b).emojis));
                    ;
                    _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    _ctx.prev = 12;
                    _iterator = values[Symbol.iterator]();
                case 14:
                    if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
                        _ctx.next = 54;
                        break;
                    }
                    value1 = _step.value;
                    if (pool.length) {
                        _ctx.next = 18;
                        break;
                    }
                    return _ctx.abrupt("break", 54);
                case 18:
                    results = [];
                    scores = {};
                    _iteratorNormalCompletion1 = true, _didIteratorError1 = false, _iteratorError1 = undefined;
                    _ctx.prev = 21;
                    _iterator1 = pool[Symbol.iterator]();
                case 23:
                    if (_iteratorNormalCompletion1 = (_step1 = _iterator1.next()).done) {
                        _ctx.next = 36;
                        break;
                    }
                    emoji = _step1.value;
                    if (emoji.search) {
                        _ctx.next = 27;
                        break;
                    }
                    return _ctx.abrupt("continue", 33);
                case 27:
                    score = emoji.search.indexOf(",".concat(value1));
                    if (!(score == -1)) {
                        _ctx.next = 30;
                        break;
                    }
                    return _ctx.abrupt("continue", 33);
                case 30:
                    results.push(emoji);
                    scores[emoji.id] || (scores[emoji.id] = 0);
                    scores[emoji.id] += emoji.id == value1 ? 0 : score + 1;
                case 33:
                    _iteratorNormalCompletion1 = true;
                    _ctx.next = 23;
                    break;
                case 36:
                    _ctx.next = 42;
                    break;
                case 38:
                    _ctx.prev = 38;
                    _ctx.t0 = _ctx["catch"](21);
                    _didIteratorError1 = true;
                    _iteratorError1 = _ctx.t0;
                case 42:
                    _ctx.prev = 42;
                    _ctx.prev = 43;
                    if (!_iteratorNormalCompletion1 && _iterator1.return != null) {
                        _iterator1.return();
                    }
                case 45:
                    _ctx.prev = 45;
                    if (!_didIteratorError1) {
                        _ctx.next = 48;
                        break;
                    }
                    throw _iteratorError1;
                case 48:
                    return _ctx.finish(45);
                case 49:
                    return _ctx.finish(42);
                case 50:
                    pool = results;
                case 51:
                    _iteratorNormalCompletion = true;
                    _ctx.next = 14;
                    break;
                case 54:
                    _ctx.next = 60;
                    break;
                case 56:
                    _ctx.prev = 56;
                    _ctx.t1 = _ctx["catch"](12);
                    _didIteratorError = true;
                    _iteratorError = _ctx.t1;
                case 60:
                    _ctx.prev = 60;
                    _ctx.prev = 61;
                    if (!_iteratorNormalCompletion && _iterator.return != null) {
                        _iterator.return();
                    }
                case 63:
                    _ctx.prev = 63;
                    if (!_didIteratorError) {
                        _ctx.next = 66;
                        break;
                    }
                    throw _iteratorError;
                case 66:
                    return _ctx.finish(63);
                case 67:
                    return _ctx.finish(60);
                case 68:
                    if (!(results.length < 2)) {
                        _ctx.next = 70;
                        break;
                    }
                    return _ctx.abrupt("return", results);
                case 70:
                    results.sort(function(a, b) {
                        var aScore = scores[a.id];
                        var bScore = scores[b.id];
                        if (aScore == bScore) return a.id.localeCompare(b.id);
                        return aScore - bScore;
                    });
                    if (results.length > maxResults) results = results.slice(0, maxResults);
                    return _ctx.abrupt("return", results);
                case 73:
                case "end":
                    return _ctx.stop();
            }
        }, _callee, null, [
            [
                12,
                56,
                60,
                68
            ],
            [
                21,
                38,
                42,
                50
            ],
            [
                43,
                ,
                45,
                49
            ],
            [
                61,
                ,
                63,
                67
            ]
        ]);
    }));
    return $022b4a7de802d8eb$var$_search.apply(this, arguments);
}
var $022b4a7de802d8eb$export$2e2bcd8739ae039 = {
    search: $022b4a7de802d8eb$var$search,
    get: $022b4a7de802d8eb$var$get,
    reset: $022b4a7de802d8eb$var$reset,
    SHORTCODES_REGEX: $022b4a7de802d8eb$var$SHORTCODES_REGEX
};


var $fc6326626d221acf$export$bcb25aa587e9cb13 = [
    "checkered_flag",
    "crossed_flags",
    "pirate_flag",
    "rainbow-flag",
    "transgender_flag",
    "triangular_flag_on_post",
    "waving_black_flag",
    "waving_white_flag", 
];


function $0542300b6c56b62c$export$9cb4719e2e525b7a(a, b) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every(function(val, index) {
        return val == b[index];
    });
}
function $0542300b6c56b62c$export$e772c8ff12451969() {
    return $0542300b6c56b62c$var$_sleep.apply(this, arguments);
}
function $0542300b6c56b62c$var$_sleep() {
    $0542300b6c56b62c$var$_sleep = (0, (/*@__PURE__*/$parcel$interopDefault($f653aaea2ce76311$exports)))((0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).mark(function _callee() {
        var frames, _, _args = arguments;
        return (0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).wrap(function _callee$(_ctx) {
            while(1)switch(_ctx.prev = _ctx.next){
                case 0:
                    frames = _args.length > 0 && _args[0] !== void 0 ? _args[0] : 1;
                    _ctx.t0 = regeneratorRuntime.keys((0, (/*@__PURE__*/$parcel$interopDefault($768065e6069a057e$exports)))(Array(frames).keys()));
                case 2:
                    if ((_ctx.t1 = _ctx.t0()).done) {
                        _ctx.next = 8;
                        break;
                    }
                    _ = _ctx.t1.value;
                    _ctx.next = 6;
                    return new Promise(requestAnimationFrame);
                case 6:
                    _ctx.next = 2;
                    break;
                case 8:
                case "end":
                    return _ctx.stop();
            }
        }, _callee);
    }));
    return $0542300b6c56b62c$var$_sleep.apply(this, arguments);
}
function $0542300b6c56b62c$export$d10ac59fbe52a745(emoji) {
    var ref = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {}, _skinIndex = ref.skinIndex, skinIndex = _skinIndex === void 0 ? 0 : _skinIndex;
    var skin = emoji.skins[skinIndex] || function() {
        skinIndex = 0;
        return emoji.skins[skinIndex];
    }();
    var emojiData = {
        id: emoji.id,
        name: emoji.name,
        native: skin.native,
        unified: skin.unified,
        keywords: emoji.keywords,
        shortcodes: skin.shortcodes || emoji.shortcodes
    };
    if (emoji.skins.length > 1) emojiData.skin = skinIndex + 1;
    if (skin.src) emojiData.src = skin.src;
    if (emoji.aliases && emoji.aliases.length) emojiData.aliases = emoji.aliases;
    if (emoji.emoticons && emoji.emoticons.length) emojiData.emoticons = emoji.emoticons;
    return emojiData;
}
function $0542300b6c56b62c$export$5ef5574deca44bc0(nativeString) {
    return $0542300b6c56b62c$var$_getEmojiDataFromNative.apply(this, arguments);
}
function $0542300b6c56b62c$var$_getEmojiDataFromNative() {
    $0542300b6c56b62c$var$_getEmojiDataFromNative = (0, (/*@__PURE__*/$parcel$interopDefault($f653aaea2ce76311$exports)))((0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).mark(function _callee(nativeString) {
        var results, emoji, skinIndex, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, skin;
        return (0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).wrap(function _callee$(_ctx) {
            while(1)switch(_ctx.prev = _ctx.next){
                case 0:
                    _ctx.next = 2;
                    return (0, $022b4a7de802d8eb$export$2e2bcd8739ae039).search(nativeString, {
                        maxResults: 1,
                        caller: "getEmojiDataFromNative"
                    });
                case 2:
                    results = _ctx.sent;
                    if (!(!results || !results.length)) {
                        _ctx.next = 5;
                        break;
                    }
                    return _ctx.abrupt("return", null);
                case 5:
                    emoji = results[0];
                    skinIndex = 0;
                    _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    _ctx.prev = 8;
                    _iterator = emoji.skins[Symbol.iterator]();
                case 10:
                    if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
                        _ctx.next = 18;
                        break;
                    }
                    skin = _step.value;
                    if (!(skin.native == nativeString)) {
                        _ctx.next = 14;
                        break;
                    }
                    return _ctx.abrupt("break", 18);
                case 14:
                    skinIndex++;
                case 15:
                    _iteratorNormalCompletion = true;
                    _ctx.next = 10;
                    break;
                case 18:
                    _ctx.next = 24;
                    break;
                case 20:
                    _ctx.prev = 20;
                    _ctx.t0 = _ctx["catch"](8);
                    _didIteratorError = true;
                    _iteratorError = _ctx.t0;
                case 24:
                    _ctx.prev = 24;
                    _ctx.prev = 25;
                    if (!_iteratorNormalCompletion && _iterator.return != null) {
                        _iterator.return();
                    }
                case 27:
                    _ctx.prev = 27;
                    if (!_didIteratorError) {
                        _ctx.next = 30;
                        break;
                    }
                    throw _iteratorError;
                case 30:
                    return _ctx.finish(27);
                case 31:
                    return _ctx.finish(24);
                case 32:
                    return _ctx.abrupt("return", $0542300b6c56b62c$export$d10ac59fbe52a745(emoji, {
                        skinIndex: skinIndex
                    }));
                case 33:
                case "end":
                    return _ctx.stop();
            }
        }, _callee, null, [
            [
                8,
                20,
                24,
                32
            ],
            [
                25,
                ,
                27,
                31
            ]
        ]);
    }));
    return $0542300b6c56b62c$var$_getEmojiDataFromNative.apply(this, arguments);
}





var $b9ae2abd9272dd52$var$categories = {
    activity: {
        outline: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                d: "M12 0C5.373 0 0 5.372 0 12c0 6.627 5.373 12 12 12 6.628 0 12-5.373 12-12 0-6.628-5.372-12-12-12m9.949 11H17.05c.224-2.527 1.232-4.773 1.968-6.113A9.966 9.966 0 0 1 21.949 11M13 11V2.051a9.945 9.945 0 0 1 4.432 1.564c-.858 1.491-2.156 4.22-2.392 7.385H13zm-2 0H8.961c-.238-3.165-1.536-5.894-2.393-7.385A9.95 9.95 0 0 1 11 2.051V11zm0 2v8.949a9.937 9.937 0 0 1-4.432-1.564c.857-1.492 2.155-4.221 2.393-7.385H11zm4.04 0c.236 3.164 1.534 5.893 2.392 7.385A9.92 9.92 0 0 1 13 21.949V13h2.04zM4.982 4.887C5.718 6.227 6.726 8.473 6.951 11h-4.9a9.977 9.977 0 0 1 2.931-6.113M2.051 13h4.9c-.226 2.527-1.233 4.771-1.969 6.113A9.972 9.972 0 0 1 2.051 13m16.967 6.113c-.735-1.342-1.744-3.586-1.968-6.113h4.899a9.961 9.961 0 0 1-2.931 6.113"
            })
        }),
        solid: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 512 512",
            children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                d: "M16.17 337.5c0 44.98 7.565 83.54 13.98 107.9C35.22 464.3 50.46 496 174.9 496c9.566 0 19.59-.4707 29.84-1.271L17.33 307.3C16.53 317.6 16.17 327.7 16.17 337.5zM495.8 174.5c0-44.98-7.565-83.53-13.98-107.9c-4.688-17.54-18.34-31.23-36.04-35.95C435.5 27.91 392.9 16 337 16c-9.564 0-19.59 .4707-29.84 1.271l187.5 187.5C495.5 194.4 495.8 184.3 495.8 174.5zM26.77 248.8l236.3 236.3c142-36.1 203.9-150.4 222.2-221.1L248.9 26.87C106.9 62.96 45.07 177.2 26.77 248.8zM256 335.1c0 9.141-7.474 16-16 16c-4.094 0-8.188-1.564-11.31-4.689L164.7 283.3C161.6 280.2 160 276.1 160 271.1c0-8.529 6.865-16 16-16c4.095 0 8.189 1.562 11.31 4.688l64.01 64C254.4 327.8 256 331.9 256 335.1zM304 287.1c0 9.141-7.474 16-16 16c-4.094 0-8.188-1.564-11.31-4.689L212.7 235.3C209.6 232.2 208 228.1 208 223.1c0-9.141 7.473-16 16-16c4.094 0 8.188 1.562 11.31 4.688l64.01 64.01C302.5 279.8 304 283.9 304 287.1zM256 175.1c0-9.141 7.473-16 16-16c4.094 0 8.188 1.562 11.31 4.688l64.01 64.01c3.125 3.125 4.688 7.219 4.688 11.31c0 9.133-7.468 16-16 16c-4.094 0-8.189-1.562-11.31-4.688l-64.01-64.01C257.6 184.2 256 180.1 256 175.1z"
            })
        })
    },
    custom: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 448 512",
        children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
            d: "M417.1 368c-5.937 10.27-16.69 16-27.75 16c-5.422 0-10.92-1.375-15.97-4.281L256 311.4V448c0 17.67-14.33 32-31.1 32S192 465.7 192 448V311.4l-118.3 68.29C68.67 382.6 63.17 384 57.75 384c-11.06 0-21.81-5.734-27.75-16c-8.828-15.31-3.594-34.88 11.72-43.72L159.1 256L41.72 187.7C26.41 178.9 21.17 159.3 29.1 144C36.63 132.5 49.26 126.7 61.65 128.2C65.78 128.7 69.88 130.1 73.72 132.3L192 200.6V64c0-17.67 14.33-32 32-32S256 46.33 256 64v136.6l118.3-68.29c3.838-2.213 7.939-3.539 12.07-4.051C398.7 126.7 411.4 132.5 417.1 144c8.828 15.31 3.594 34.88-11.72 43.72L288 256l118.3 68.28C421.6 333.1 426.8 352.7 417.1 368z"
        })
    }),
    flags: {
        outline: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                d: "M0 0l6.084 24H8L1.916 0zM21 5h-4l-1-4H4l3 12h3l1 4h13L21 5zM6.563 3h7.875l2 8H8.563l-2-8zm8.832 10l-2.856 1.904L12.063 13h3.332zM19 13l-1.5-6h1.938l2 8H16l3-2z"
            })
        }),
        solid: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 512 512",
            children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                d: "M64 496C64 504.8 56.75 512 48 512h-32C7.25 512 0 504.8 0 496V32c0-17.75 14.25-32 32-32s32 14.25 32 32V496zM476.3 0c-6.365 0-13.01 1.35-19.34 4.233c-45.69 20.86-79.56 27.94-107.8 27.94c-59.96 0-94.81-31.86-163.9-31.87C160.9 .3055 131.6 4.867 96 15.75v350.5c32-9.984 59.87-14.1 84.85-14.1c73.63 0 124.9 31.78 198.6 31.78c31.91 0 68.02-5.971 111.1-23.09C504.1 355.9 512 344.4 512 332.1V30.73C512 11.1 495.3 0 476.3 0z"
            })
        })
    },
    foods: {
        outline: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                d: "M17 4.978c-1.838 0-2.876.396-3.68.934.513-1.172 1.768-2.934 4.68-2.934a1 1 0 0 0 0-2c-2.921 0-4.629 1.365-5.547 2.512-.064.078-.119.162-.18.244C11.73 1.838 10.798.023 9.207.023 8.579.022 7.85.306 7 .978 5.027 2.54 5.329 3.902 6.492 4.999 3.609 5.222 0 7.352 0 12.969c0 4.582 4.961 11.009 9 11.009 1.975 0 2.371-.486 3-1 .629.514 1.025 1 3 1 4.039 0 9-6.418 9-11 0-5.953-4.055-8-7-8M8.242 2.546c.641-.508.943-.523.965-.523.426.169.975 1.405 1.357 3.055-1.527-.629-2.741-1.352-2.98-1.846.059-.112.241-.356.658-.686M15 21.978c-1.08 0-1.21-.109-1.559-.402l-.176-.146c-.367-.302-.816-.452-1.266-.452s-.898.15-1.266.452l-.176.146c-.347.292-.477.402-1.557.402-2.813 0-7-5.389-7-9.009 0-5.823 4.488-5.991 5-5.991 1.939 0 2.484.471 3.387 1.251l.323.276a1.995 1.995 0 0 0 2.58 0l.323-.276c.902-.78 1.447-1.251 3.387-1.251.512 0 5 .168 5 6 0 3.617-4.187 9-7 9"
            })
        }),
        solid: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 512 512",
            children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                d: "M481.9 270.1C490.9 279.1 496 291.3 496 304C496 316.7 490.9 328.9 481.9 337.9C472.9 346.9 460.7 352 448 352H64C51.27 352 39.06 346.9 30.06 337.9C21.06 328.9 16 316.7 16 304C16 291.3 21.06 279.1 30.06 270.1C39.06 261.1 51.27 256 64 256H448C460.7 256 472.9 261.1 481.9 270.1zM475.3 388.7C478.3 391.7 480 395.8 480 400V416C480 432.1 473.3 449.3 461.3 461.3C449.3 473.3 432.1 480 416 480H96C79.03 480 62.75 473.3 50.75 461.3C38.74 449.3 32 432.1 32 416V400C32 395.8 33.69 391.7 36.69 388.7C39.69 385.7 43.76 384 48 384H464C468.2 384 472.3 385.7 475.3 388.7zM50.39 220.8C45.93 218.6 42.03 215.5 38.97 211.6C35.91 207.7 33.79 203.2 32.75 198.4C31.71 193.5 31.8 188.5 32.99 183.7C54.98 97.02 146.5 32 256 32C365.5 32 457 97.02 479 183.7C480.2 188.5 480.3 193.5 479.2 198.4C478.2 203.2 476.1 207.7 473 211.6C469.1 215.5 466.1 218.6 461.6 220.8C457.2 222.9 452.3 224 447.3 224H64.67C59.73 224 54.84 222.9 50.39 220.8zM372.7 116.7C369.7 119.7 368 123.8 368 128C368 131.2 368.9 134.3 370.7 136.9C372.5 139.5 374.1 141.6 377.9 142.8C380.8 143.1 384 144.3 387.1 143.7C390.2 143.1 393.1 141.6 395.3 139.3C397.6 137.1 399.1 134.2 399.7 131.1C400.3 128 399.1 124.8 398.8 121.9C397.6 118.1 395.5 116.5 392.9 114.7C390.3 112.9 387.2 111.1 384 111.1C379.8 111.1 375.7 113.7 372.7 116.7V116.7zM244.7 84.69C241.7 87.69 240 91.76 240 96C240 99.16 240.9 102.3 242.7 104.9C244.5 107.5 246.1 109.6 249.9 110.8C252.8 111.1 256 112.3 259.1 111.7C262.2 111.1 265.1 109.6 267.3 107.3C269.6 105.1 271.1 102.2 271.7 99.12C272.3 96.02 271.1 92.8 270.8 89.88C269.6 86.95 267.5 84.45 264.9 82.7C262.3 80.94 259.2 79.1 256 79.1C251.8 79.1 247.7 81.69 244.7 84.69V84.69zM116.7 116.7C113.7 119.7 112 123.8 112 128C112 131.2 112.9 134.3 114.7 136.9C116.5 139.5 118.1 141.6 121.9 142.8C124.8 143.1 128 144.3 131.1 143.7C134.2 143.1 137.1 141.6 139.3 139.3C141.6 137.1 143.1 134.2 143.7 131.1C144.3 128 143.1 124.8 142.8 121.9C141.6 118.1 139.5 116.5 136.9 114.7C134.3 112.9 131.2 111.1 128 111.1C123.8 111.1 119.7 113.7 116.7 116.7L116.7 116.7z"
            })
        })
    },
    frequent: {
        outline: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: [
                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                    d: "M13 4h-2l-.001 7H9v2h2v2h2v-2h4v-2h-4z"
                }),
                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                    d: "M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0m0 22C6.486 22 2 17.514 2 12S6.486 2 12 2s10 4.486 10 10-4.486 10-10 10"
                })
            ]
        }),
        solid: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 512 512",
            children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                d: "M256 512C114.6 512 0 397.4 0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256C512 397.4 397.4 512 256 512zM232 256C232 264 236 271.5 242.7 275.1L338.7 339.1C349.7 347.3 364.6 344.3 371.1 333.3C379.3 322.3 376.3 307.4 365.3 300L280 243.2V120C280 106.7 269.3 96 255.1 96C242.7 96 231.1 106.7 231.1 120L232 256z"
            })
        })
    },
    nature: {
        outline: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: [
                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                    d: "M15.5 8a1.5 1.5 0 1 0 .001 3.001A1.5 1.5 0 0 0 15.5 8M8.5 8a1.5 1.5 0 1 0 .001 3.001A1.5 1.5 0 0 0 8.5 8"
                }),
                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                    d: "M18.933 0h-.027c-.97 0-2.138.787-3.018 1.497-1.274-.374-2.612-.51-3.887-.51-1.285 0-2.616.133-3.874.517C7.245.79 6.069 0 5.093 0h-.027C3.352 0 .07 2.67.002 7.026c-.039 2.479.276 4.238 1.04 5.013.254.258.882.677 1.295.882.191 3.177.922 5.238 2.536 6.38.897.637 2.187.949 3.2 1.102C8.04 20.6 8 20.795 8 21c0 1.773 2.35 3 4 3 1.648 0 4-1.227 4-3 0-.201-.038-.393-.072-.586 2.573-.385 5.435-1.877 5.925-7.587.396-.22.887-.568 1.104-.788.763-.774 1.079-2.534 1.04-5.013C23.929 2.67 20.646 0 18.933 0M3.223 9.135c-.237.281-.837 1.155-.884 1.238-.15-.41-.368-1.349-.337-3.291.051-3.281 2.478-4.972 3.091-5.031.256.015.731.27 1.265.646-1.11 1.171-2.275 2.915-2.352 5.125-.133.546-.398.858-.783 1.313M12 22c-.901 0-1.954-.693-2-1 0-.654.475-1.236 1-1.602V20a1 1 0 1 0 2 0v-.602c.524.365 1 .947 1 1.602-.046.307-1.099 1-2 1m3-3.48v.02a4.752 4.752 0 0 0-1.262-1.02c1.092-.516 2.239-1.334 2.239-2.217 0-1.842-1.781-2.195-3.977-2.195-2.196 0-3.978.354-3.978 2.195 0 .883 1.148 1.701 2.238 2.217A4.8 4.8 0 0 0 9 18.539v-.025c-1-.076-2.182-.281-2.973-.842-1.301-.92-1.838-3.045-1.853-6.478l.023-.041c.496-.826 1.49-1.45 1.804-3.102 0-2.047 1.357-3.631 2.362-4.522C9.37 3.178 10.555 3 11.948 3c1.447 0 2.685.192 3.733.57 1 .9 2.316 2.465 2.316 4.48.313 1.651 1.307 2.275 1.803 3.102.035.058.068.117.102.178-.059 5.967-1.949 7.01-4.902 7.19m6.628-8.202c-.037-.065-.074-.13-.113-.195a7.587 7.587 0 0 0-.739-.987c-.385-.455-.648-.768-.782-1.313-.076-2.209-1.241-3.954-2.353-5.124.531-.376 1.004-.63 1.261-.647.636.071 3.044 1.764 3.096 5.031.027 1.81-.347 3.218-.37 3.235"
                })
            ]
        }),
        solid: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 576 512",
            children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                d: "M332.7 19.85C334.6 8.395 344.5 0 356.1 0C363.6 0 370.6 3.52 375.1 9.502L392 32H444.1C456.8 32 469.1 37.06 478.1 46.06L496 64H552C565.3 64 576 74.75 576 88V112C576 156.2 540.2 192 496 192H426.7L421.6 222.5L309.6 158.5L332.7 19.85zM448 64C439.2 64 432 71.16 432 80C432 88.84 439.2 96 448 96C456.8 96 464 88.84 464 80C464 71.16 456.8 64 448 64zM416 256.1V480C416 497.7 401.7 512 384 512H352C334.3 512 320 497.7 320 480V364.8C295.1 377.1 268.8 384 240 384C211.2 384 184 377.1 160 364.8V480C160 497.7 145.7 512 128 512H96C78.33 512 64 497.7 64 480V249.8C35.23 238.9 12.64 214.5 4.836 183.3L.9558 167.8C-3.331 150.6 7.094 133.2 24.24 128.1C41.38 124.7 58.76 135.1 63.05 152.2L66.93 167.8C70.49 182 83.29 191.1 97.97 191.1H303.8L416 256.1z"
            })
        })
    },
    objects: {
        outline: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: [
                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                    d: "M12 0a9 9 0 0 0-5 16.482V21s2.035 3 5 3 5-3 5-3v-4.518A9 9 0 0 0 12 0zm0 2c3.86 0 7 3.141 7 7s-3.14 7-7 7-7-3.141-7-7 3.14-7 7-7zM9 17.477c.94.332 1.946.523 3 .523s2.06-.19 3-.523v.834c-.91.436-1.925.689-3 .689a6.924 6.924 0 0 1-3-.69v-.833zm.236 3.07A8.854 8.854 0 0 0 12 21c.965 0 1.888-.167 2.758-.451C14.155 21.173 13.153 22 12 22c-1.102 0-2.117-.789-2.764-1.453z"
                }),
                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                    d: "M14.745 12.449h-.004c-.852-.024-1.188-.858-1.577-1.824-.421-1.061-.703-1.561-1.182-1.566h-.009c-.481 0-.783.497-1.235 1.537-.436.982-.801 1.811-1.636 1.791l-.276-.043c-.565-.171-.853-.691-1.284-1.794-.125-.313-.202-.632-.27-.913-.051-.213-.127-.53-.195-.634C7.067 9.004 7.039 9 6.99 9A1 1 0 0 1 7 7h.01c1.662.017 2.015 1.373 2.198 2.134.486-.981 1.304-2.058 2.797-2.075 1.531.018 2.28 1.153 2.731 2.141l.002-.008C14.944 8.424 15.327 7 16.979 7h.032A1 1 0 1 1 17 9h-.011c-.149.076-.256.474-.319.709a6.484 6.484 0 0 1-.311.951c-.429.973-.79 1.789-1.614 1.789"
                })
            ]
        }),
        solid: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 384 512",
            children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                d: "M112.1 454.3c0 6.297 1.816 12.44 5.284 17.69l17.14 25.69c5.25 7.875 17.17 14.28 26.64 14.28h61.67c9.438 0 21.36-6.401 26.61-14.28l17.08-25.68c2.938-4.438 5.348-12.37 5.348-17.7L272 415.1h-160L112.1 454.3zM191.4 .0132C89.44 .3257 16 82.97 16 175.1c0 44.38 16.44 84.84 43.56 115.8c16.53 18.84 42.34 58.23 52.22 91.45c.0313 .25 .0938 .5166 .125 .7823h160.2c.0313-.2656 .0938-.5166 .125-.7823c9.875-33.22 35.69-72.61 52.22-91.45C351.6 260.8 368 220.4 368 175.1C368 78.61 288.9-.2837 191.4 .0132zM192 96.01c-44.13 0-80 35.89-80 79.1C112 184.8 104.8 192 96 192S80 184.8 80 176c0-61.76 50.25-111.1 112-111.1c8.844 0 16 7.159 16 16S200.8 96.01 192 96.01z"
            })
        })
    },
    people: {
        outline: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: [
                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                    d: "M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0m0 22C6.486 22 2 17.514 2 12S6.486 2 12 2s10 4.486 10 10-4.486 10-10 10"
                }),
                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                    d: "M8 7a2 2 0 1 0-.001 3.999A2 2 0 0 0 8 7M16 7a2 2 0 1 0-.001 3.999A2 2 0 0 0 16 7M15.232 15c-.693 1.195-1.87 2-3.349 2-1.477 0-2.655-.805-3.347-2H15m3-2H6a6 6 0 1 0 12 0"
                })
            ]
        }),
        solid: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 512 512",
            children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                d: "M0 256C0 114.6 114.6 0 256 0C397.4 0 512 114.6 512 256C512 397.4 397.4 512 256 512C114.6 512 0 397.4 0 256zM256 432C332.1 432 396.2 382 415.2 314.1C419.1 300.4 407.8 288 393.6 288H118.4C104.2 288 92.92 300.4 96.76 314.1C115.8 382 179.9 432 256 432V432zM176.4 160C158.7 160 144.4 174.3 144.4 192C144.4 209.7 158.7 224 176.4 224C194 224 208.4 209.7 208.4 192C208.4 174.3 194 160 176.4 160zM336.4 224C354 224 368.4 209.7 368.4 192C368.4 174.3 354 160 336.4 160C318.7 160 304.4 174.3 304.4 192C304.4 209.7 318.7 224 336.4 224z"
            })
        })
    },
    places: {
        outline: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: [
                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                    d: "M6.5 12C5.122 12 4 13.121 4 14.5S5.122 17 6.5 17 9 15.879 9 14.5 7.878 12 6.5 12m0 3c-.275 0-.5-.225-.5-.5s.225-.5.5-.5.5.225.5.5-.225.5-.5.5M17.5 12c-1.378 0-2.5 1.121-2.5 2.5s1.122 2.5 2.5 2.5 2.5-1.121 2.5-2.5-1.122-2.5-2.5-2.5m0 3c-.275 0-.5-.225-.5-.5s.225-.5.5-.5.5.225.5.5-.225.5-.5.5"
                }),
                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                    d: "M22.482 9.494l-1.039-.346L21.4 9h.6c.552 0 1-.439 1-.992 0-.006-.003-.008-.003-.008H23c0-1-.889-2-1.984-2h-.642l-.731-1.717C19.262 3.012 18.091 2 16.764 2H7.236C5.909 2 4.738 3.012 4.357 4.283L3.626 6h-.642C1.889 6 1 7 1 8h.003S1 8.002 1 8.008C1 8.561 1.448 9 2 9h.6l-.043.148-1.039.346a2.001 2.001 0 0 0-1.359 2.097l.751 7.508a1 1 0 0 0 .994.901H3v1c0 1.103.896 2 2 2h2c1.104 0 2-.897 2-2v-1h6v1c0 1.103.896 2 2 2h2c1.104 0 2-.897 2-2v-1h1.096a.999.999 0 0 0 .994-.901l.751-7.508a2.001 2.001 0 0 0-1.359-2.097M6.273 4.857C6.402 4.43 6.788 4 7.236 4h9.527c.448 0 .834.43.963.857L19.313 9H4.688l1.585-4.143zM7 21H5v-1h2v1zm12 0h-2v-1h2v1zm2.189-3H2.811l-.662-6.607L3 11h18l.852.393L21.189 18z"
                })
            ]
        }),
        solid: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 512 512",
            children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                d: "M39.61 196.8L74.8 96.29C88.27 57.78 124.6 32 165.4 32H346.6C387.4 32 423.7 57.78 437.2 96.29L472.4 196.8C495.6 206.4 512 229.3 512 256V448C512 465.7 497.7 480 480 480H448C430.3 480 416 465.7 416 448V400H96V448C96 465.7 81.67 480 64 480H32C14.33 480 0 465.7 0 448V256C0 229.3 16.36 206.4 39.61 196.8V196.8zM109.1 192H402.9L376.8 117.4C372.3 104.6 360.2 96 346.6 96H165.4C151.8 96 139.7 104.6 135.2 117.4L109.1 192zM96 256C78.33 256 64 270.3 64 288C64 305.7 78.33 320 96 320C113.7 320 128 305.7 128 288C128 270.3 113.7 256 96 256zM416 320C433.7 320 448 305.7 448 288C448 270.3 433.7 256 416 256C398.3 256 384 270.3 384 288C384 305.7 398.3 320 416 320z"
            })
        })
    },
    symbols: {
        outline: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 24 24",
            children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                d: "M0 0h11v2H0zM4 11h3V6h4V4H0v2h4zM15.5 17c1.381 0 2.5-1.116 2.5-2.493s-1.119-2.493-2.5-2.493S13 13.13 13 14.507 14.119 17 15.5 17m0-2.986c.276 0 .5.222.5.493 0 .272-.224.493-.5.493s-.5-.221-.5-.493.224-.493.5-.493M21.5 19.014c-1.381 0-2.5 1.116-2.5 2.493S20.119 24 21.5 24s2.5-1.116 2.5-2.493-1.119-2.493-2.5-2.493m0 2.986a.497.497 0 0 1-.5-.493c0-.271.224-.493.5-.493s.5.222.5.493a.497.497 0 0 1-.5.493M22 13l-9 9 1.513 1.5 8.99-9.009zM17 11c2.209 0 4-1.119 4-2.5V2s.985-.161 1.498.949C23.01 4.055 23 6 23 6s1-1.119 1-3.135C24-.02 21 0 21 0h-2v6.347A5.853 5.853 0 0 0 17 6c-2.209 0-4 1.119-4 2.5s1.791 2.5 4 2.5M10.297 20.482l-1.475-1.585a47.54 47.54 0 0 1-1.442 1.129c-.307-.288-.989-1.016-2.045-2.183.902-.836 1.479-1.466 1.729-1.892s.376-.871.376-1.336c0-.592-.273-1.178-.818-1.759-.546-.581-1.329-.871-2.349-.871-1.008 0-1.79.293-2.344.879-.556.587-.832 1.181-.832 1.784 0 .813.419 1.748 1.256 2.805-.847.614-1.444 1.208-1.794 1.784a3.465 3.465 0 0 0-.523 1.833c0 .857.308 1.56.924 2.107.616.549 1.423.823 2.42.823 1.173 0 2.444-.379 3.813-1.137L8.235 24h2.819l-2.09-2.383 1.333-1.135zm-6.736-6.389a1.02 1.02 0 0 1 .73-.286c.31 0 .559.085.747.254a.849.849 0 0 1 .283.659c0 .518-.419 1.112-1.257 1.784-.536-.651-.805-1.231-.805-1.742a.901.901 0 0 1 .302-.669M3.74 22c-.427 0-.778-.116-1.057-.349-.279-.232-.418-.487-.418-.766 0-.594.509-1.288 1.527-2.083.968 1.134 1.717 1.946 2.248 2.438-.921.507-1.686.76-2.3.76"
            })
        }),
        solid: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
            xmlns: "http://www.w3.org/2000/svg",
            viewBox: "0 0 512 512",
            children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
                d: "M500.3 7.251C507.7 13.33 512 22.41 512 31.1V175.1C512 202.5 483.3 223.1 447.1 223.1C412.7 223.1 383.1 202.5 383.1 175.1C383.1 149.5 412.7 127.1 447.1 127.1V71.03L351.1 90.23V207.1C351.1 234.5 323.3 255.1 287.1 255.1C252.7 255.1 223.1 234.5 223.1 207.1C223.1 181.5 252.7 159.1 287.1 159.1V63.1C287.1 48.74 298.8 35.61 313.7 32.62L473.7 .6198C483.1-1.261 492.9 1.173 500.3 7.251H500.3zM74.66 303.1L86.5 286.2C92.43 277.3 102.4 271.1 113.1 271.1H174.9C185.6 271.1 195.6 277.3 201.5 286.2L213.3 303.1H239.1C266.5 303.1 287.1 325.5 287.1 351.1V463.1C287.1 490.5 266.5 511.1 239.1 511.1H47.1C21.49 511.1-.0019 490.5-.0019 463.1V351.1C-.0019 325.5 21.49 303.1 47.1 303.1H74.66zM143.1 359.1C117.5 359.1 95.1 381.5 95.1 407.1C95.1 434.5 117.5 455.1 143.1 455.1C170.5 455.1 191.1 434.5 191.1 407.1C191.1 381.5 170.5 359.1 143.1 359.1zM440.3 367.1H496C502.7 367.1 508.6 372.1 510.1 378.4C513.3 384.6 511.6 391.7 506.5 396L378.5 508C372.9 512.1 364.6 513.3 358.6 508.9C352.6 504.6 350.3 496.6 353.3 489.7L391.7 399.1H336C329.3 399.1 323.4 395.9 321 389.6C318.7 383.4 320.4 376.3 325.5 371.1L453.5 259.1C459.1 255 467.4 254.7 473.4 259.1C479.4 263.4 481.6 271.4 478.7 278.3L440.3 367.1zM116.7 219.1L19.85 119.2C-8.112 90.26-6.614 42.31 24.85 15.34C51.82-8.137 93.26-3.642 118.2 21.83L128.2 32.32L137.7 21.83C162.7-3.642 203.6-8.137 231.6 15.34C262.6 42.31 264.1 90.26 236.1 119.2L139.7 219.1C133.2 225.6 122.7 225.6 116.7 219.1H116.7z"
            })
        })
    }
};
var $b9ae2abd9272dd52$var$search = {
    loupe: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 20 20",
        children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
            d: "M12.9 14.32a8 8 0 1 1 1.41-1.41l5.35 5.33-1.42 1.42-5.33-5.34zM8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12z"
        })
    }),
    delete: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 20 20",
        children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("path", {
            d: "M10 8.586L2.929 1.515 1.515 2.929 8.586 10l-7.071 7.071 1.414 1.414L10 11.414l7.071 7.071 1.414-1.414L11.414 10l7.071-7.071-1.414-1.414L10 8.586z"
        })
    })
};
var $b9ae2abd9272dd52$export$2e2bcd8739ae039 = {
    categories: $b9ae2abd9272dd52$var$categories,
    search: $b9ae2abd9272dd52$var$search
};





function $4229cb2d7488f9c8$export$2e2bcd8739ae039(props) {
    var id = props.id, skin = props.skin, emoji = props.emoji;
    if (props.shortcodes) {
        var matches = props.shortcodes.match((0, $022b4a7de802d8eb$export$2e2bcd8739ae039).SHORTCODES_REGEX);
        if (matches) {
            id = matches[1];
            if (matches[2]) skin = matches[2];
        }
    }
    emoji || (emoji = (0, $022b4a7de802d8eb$export$2e2bcd8739ae039).get(id || props.native));
    if (!emoji) return props.fallback;
    var emojiSkin = emoji.skins[skin - 1] || emoji.skins[0];
    var imageSrc = emojiSkin.src || (props.set != "native" && !props.spritesheet ? typeof props.getImageURL === "function" ? props.getImageURL(props.set, emojiSkin.unified) : "https://cdn.jsdelivr.net/npm/emoji-datasource-".concat(props.set, "@15.0.1/img/").concat(props.set, "/64/").concat(emojiSkin.unified, ".png") : undefined);
    var spritesheetSrc = typeof props.getSpritesheetURL === "function" ? props.getSpritesheetURL(props.set) : "https://cdn.jsdelivr.net/npm/emoji-datasource-".concat(props.set, "@15.0.1/img/").concat(props.set, "/sheets-256/64.png");
    return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("span", {
        class: "emoji-mart-emoji",
        "data-emoji-set": props.set,
        children: imageSrc ? /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("img", {
            style: {
                maxWidth: props.size || "1em",
                maxHeight: props.size || "1em",
                display: "inline-block"
            },
            alt: emojiSkin.native || emojiSkin.shortcodes,
            src: imageSrc
        }) : props.set == "native" ? /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("span", {
            style: {
                fontSize: props.size,
                fontFamily: '"EmojiMart", "Segoe UI Emoji", "Segoe UI Symbol", "Segoe UI", "Apple Color Emoji", "Twemoji Mozilla", "Noto Color Emoji", "Android Emoji"'
            },
            children: emojiSkin.native
        }) : /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("span", {
            style: {
                display: "block",
                width: props.size,
                height: props.size,
                backgroundImage: "url(".concat(spritesheetSrc, ")"),
                backgroundSize: "".concat(100 * (0, $47b4a70d4572a3b3$export$2d0294657ab35f1b).sheet.cols, "% ").concat(100 * (0, $47b4a70d4572a3b3$export$2d0294657ab35f1b).sheet.rows, "%"),
                backgroundPosition: "".concat(100 / ((0, $47b4a70d4572a3b3$export$2d0294657ab35f1b).sheet.cols - 1) * emojiSkin.x, "% ").concat(100 / ((0, $47b4a70d4572a3b3$export$2d0294657ab35f1b).sheet.rows - 1) * emojiSkin.y, "%")
            }
        })
    });
}






var $gntqc = parcelRequire("gntqc");


var $9204f98edff0a503$exports = {};
"use strict";
Object.defineProperty($9204f98edff0a503$exports, "__esModule", {
    value: true
});
Object.defineProperty($9204f98edff0a503$exports, "default", {
    enumerable: true,
    get: ()=>$9204f98edff0a503$var$_wrapNativeSuper
});

const $9204f98edff0a503$var$_constructMjs = /*#__PURE__*/ $9204f98edff0a503$var$_interopRequireDefault((parcelRequire("e2Hua")));

const $9204f98edff0a503$var$_isNativeFunctionMjs = /*#__PURE__*/ $9204f98edff0a503$var$_interopRequireDefault((parcelRequire("jeCu1")));

const $9204f98edff0a503$var$_getPrototypeOfMjs = /*#__PURE__*/ $9204f98edff0a503$var$_interopRequireDefault((parcelRequire("680au")));

const $9204f98edff0a503$var$_setPrototypeOfMjs = /*#__PURE__*/ $9204f98edff0a503$var$_interopRequireDefault((parcelRequire("aZTUZ")));
function $9204f98edff0a503$var$_interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function $9204f98edff0a503$var$wrapNativeSuper(Class1) {
    var _cache = typeof Map === "function" ? new Map() : undefined;
    $9204f98edff0a503$var$wrapNativeSuper = function wrapNativeSuper(Class) {
        if (Class === null || !(0, $9204f98edff0a503$var$_isNativeFunctionMjs.default)(Class)) return Class;
        if (typeof Class !== "function") throw new TypeError("Super expression must either be null or a function");
        if (typeof _cache !== "undefined") {
            if (_cache.has(Class)) return _cache.get(Class);
            _cache.set(Class, Wrapper);
        }
        function Wrapper() {
            return (0, $9204f98edff0a503$var$_constructMjs.default)(Class, arguments, (0, $9204f98edff0a503$var$_getPrototypeOfMjs.default)(this).constructor);
        }
        Wrapper.prototype = Object.create(Class.prototype, {
            constructor: {
                value: Wrapper,
                enumerable: false,
                writable: true,
                configurable: true
            }
        });
        return (0, $9204f98edff0a503$var$_setPrototypeOfMjs.default)(Wrapper, Class);
    };
    return $9204f98edff0a503$var$wrapNativeSuper(Class1);
}
function $9204f98edff0a503$var$_wrapNativeSuper(Class) {
    return $9204f98edff0a503$var$wrapNativeSuper(Class);
}








var $5MCow = parcelRequire("5MCow");



var $gntqc = parcelRequire("gntqc");



var $d03bf5953babc97e$var$WindowHTMLElement = typeof window !== "undefined" && window.HTMLElement ? window.HTMLElement : Object;
var $d03bf5953babc97e$export$2e2bcd8739ae039 = /*#__PURE__*/ function(WindowHTMLElement1) {
    "use strict";
    (0, (/*@__PURE__*/$parcel$interopDefault($668009e4f1a1d720$exports)))(HTMLElement, WindowHTMLElement1);
    var _super = (0, (/*@__PURE__*/$parcel$interopDefault($a72404fd66b37813$exports)))(HTMLElement);
    function HTMLElement() {
        var props = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
        (0, (/*@__PURE__*/$parcel$interopDefault($aceb8ee155713853$exports)))(this, HTMLElement);
        var _this;
        _this = _super.call(this);
        _this.props = props;
        if (props.parent || props.ref) {
            var ref = null;
            var parent = props.parent || (ref = props.ref && props.ref.current);
            if (ref) ref.innerHTML = "";
            if (parent) parent.appendChild((0, (/*@__PURE__*/$parcel$interopDefault($5MCow)))(_this));
        }
        return _this;
    }
    (0, (/*@__PURE__*/$parcel$interopDefault($bf5a3d69977e47ef$exports)))(HTMLElement, [
        {
            key: "update",
            value: function update() {
                var props = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
                for(var k in props)this.attributeChangedCallback(k, null, props[k]);
            }
        },
        {
            key: "attributeChangedCallback",
            value: function attributeChangedCallback(attr, _, newValue) {
                if (!this.component) return;
                var value = (0, $47b4a70d4572a3b3$export$88c9ddb45cea7241)(attr, (0, (/*@__PURE__*/$parcel$interopDefault($gntqc)))({}, attr, newValue), this.constructor.Props, this);
                if (this.component.componentWillReceiveProps) this.component.componentWillReceiveProps((0, (/*@__PURE__*/$parcel$interopDefault($gntqc)))({}, attr, value));
                else {
                    this.component.props[attr] = value;
                    this.component.forceUpdate();
                }
            }
        },
        {
            key: "disconnectedCallback",
            value: function disconnectedCallback() {
                this.disconnected = true;
                if (this.component && this.component.unregister) this.component.unregister();
            }
        }
    ], [
        {
            key: "observedAttributes",
            get: function get() {
                return Object.keys(this.Props);
            }
        }
    ]);
    return HTMLElement;
}($d03bf5953babc97e$var$WindowHTMLElement);








var $e3d2d32fa7bd8892$export$2e2bcd8739ae039 = /*#__PURE__*/ function(HTMLElement1) {
    "use strict";
    (0, (/*@__PURE__*/$parcel$interopDefault($668009e4f1a1d720$exports)))(ShadowElement, HTMLElement1);
    var _super = (0, (/*@__PURE__*/$parcel$interopDefault($a72404fd66b37813$exports)))(ShadowElement);
    function ShadowElement(props) {
        var styles = (arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {}).styles;
        (0, (/*@__PURE__*/$parcel$interopDefault($aceb8ee155713853$exports)))(this, ShadowElement);
        var _this;
        _this = _super.call(this, props);
        _this.setShadow();
        _this.injectStyles(styles);
        return _this;
    }
    (0, (/*@__PURE__*/$parcel$interopDefault($bf5a3d69977e47ef$exports)))(ShadowElement, [
        {
            key: "setShadow",
            value: function setShadow() {
                this.attachShadow({
                    mode: "open"
                });
            }
        },
        {
            key: "injectStyles",
            value: function injectStyles(styles) {
                if (!styles) return;
                var style = document.createElement("style");
                style.textContent = styles;
                this.shadowRoot.insertBefore(style, this.shadowRoot.firstChild);
            }
        }
    ]);
    return ShadowElement;
}((0, (/*@__PURE__*/$parcel$interopDefault($9204f98edff0a503$exports)))((0, $d03bf5953babc97e$export$2e2bcd8739ae039)));






var $aca968f0b71b213a$export$2e2bcd8739ae039 = {
    fallback: "",
    id: "",
    native: "",
    shortcodes: "",
    size: {
        value: "",
        transform: function(value) {
            // If the value is a number, then we assume it’s a pixel value.
            if (!/\D/.test(value)) return "".concat(value, "px");
            return value;
        }
    },
    // Shared
    set: (0, $f39d0d696aba82c3$export$2e2bcd8739ae039).set,
    skin: (0, $f39d0d696aba82c3$export$2e2bcd8739ae039).skin
};


var $51648ec150f74990$export$2e2bcd8739ae039 = /*#__PURE__*/ function(HTMLElement1) {
    "use strict";
    (0, (/*@__PURE__*/$parcel$interopDefault($668009e4f1a1d720$exports)))(EmojiElement, HTMLElement1);
    var _super = (0, (/*@__PURE__*/$parcel$interopDefault($a72404fd66b37813$exports)))(EmojiElement);
    function EmojiElement(props) {
        (0, (/*@__PURE__*/$parcel$interopDefault($aceb8ee155713853$exports)))(this, EmojiElement);
        return _super.call(this, props);
    }
    (0, (/*@__PURE__*/$parcel$interopDefault($bf5a3d69977e47ef$exports)))(EmojiElement, [
        {
            key: "connectedCallback",
            value: function connectedCallback() {
                var _this = this;
                return (0, (/*@__PURE__*/$parcel$interopDefault($f653aaea2ce76311$exports)))((0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).mark(function _callee() {
                    var props;
                    return (0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).wrap(function _callee$(_ctx) {
                        while(1)switch(_ctx.prev = _ctx.next){
                            case 0:
                                props = (0, $47b4a70d4572a3b3$export$75fe5f91d452f94b)(_this.props, (0, $aca968f0b71b213a$export$2e2bcd8739ae039), _this);
                                props.element = _this;
                                props.ref = function(component) {
                                    _this.component = component;
                                };
                                _ctx.next = 5;
                                return (0, $47b4a70d4572a3b3$export$2cd8252107eb640b)();
                            case 5:
                                if (!_this.disconnected) {
                                    _ctx.next = 7;
                                    break;
                                }
                                return _ctx.abrupt("return");
                            case 7:
                                (0, $d5fc6ac583bc94a1$export$b3890eb0ae9dca99)(/*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)((0, $4229cb2d7488f9c8$export$2e2bcd8739ae039), (0, (/*@__PURE__*/$parcel$interopDefault($06c6b18a6115d5f3$exports)))({}, props)), _this);
                            case 8:
                            case "end":
                                return _ctx.stop();
                        }
                    }, _callee);
                }))();
            }
        }
    ]);
    return EmojiElement;
}((0, (/*@__PURE__*/$parcel$interopDefault($9204f98edff0a503$exports)))((0, $d03bf5953babc97e$export$2e2bcd8739ae039)));
(0, (/*@__PURE__*/$parcel$interopDefault($gntqc)))($51648ec150f74990$export$2e2bcd8739ae039, "Props", (0, $aca968f0b71b213a$export$2e2bcd8739ae039));
if (typeof customElements !== "undefined" && !customElements.get("em-emoji")) customElements.define("em-emoji", $51648ec150f74990$export$2e2bcd8739ae039);










var $hdvdM = parcelRequire("hdvdM");

var $fcff12f1905ff4d3$var$t, $fcff12f1905ff4d3$var$u5, $fcff12f1905ff4d3$var$r, $fcff12f1905ff4d3$var$o = 0, $fcff12f1905ff4d3$var$i = [], $fcff12f1905ff4d3$var$c = (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__b, $fcff12f1905ff4d3$var$f = (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__r, $fcff12f1905ff4d3$var$e = (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).diffed, $fcff12f1905ff4d3$var$a = (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__c, $fcff12f1905ff4d3$var$v = (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).unmount;
function $fcff12f1905ff4d3$var$m(t1, r1) {
    (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__h && (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__h($fcff12f1905ff4d3$var$u5, t1, $fcff12f1905ff4d3$var$o || r1), $fcff12f1905ff4d3$var$o = 0;
    var i1 = $fcff12f1905ff4d3$var$u5.__H || ($fcff12f1905ff4d3$var$u5.__H = {
        __: [],
        __h: []
    });
    return t1 >= i1.__.length && i1.__.push({}), i1.__[t1];
}
function $fcff12f1905ff4d3$export$60241385465d0a34(n1) {
    return $fcff12f1905ff4d3$var$o = 1, $fcff12f1905ff4d3$export$13e3392192263954($fcff12f1905ff4d3$var$w, n1);
}
function $fcff12f1905ff4d3$export$13e3392192263954(n2, r2, o1) {
    var i2 = $fcff12f1905ff4d3$var$m($fcff12f1905ff4d3$var$t++, 2);
    return i2.t = n2, i2.__c || (i2.__ = [
        o1 ? o1(r2) : $fcff12f1905ff4d3$var$w(void 0, r2),
        function(n3) {
            var t2 = i2.t(i2.__[0], n3);
            i2.__[0] !== t2 && (i2.__ = [
                t2,
                i2.__[1]
            ], i2.__c.setState({}));
        }
    ], i2.__c = $fcff12f1905ff4d3$var$u5), i2.__;
}
function $fcff12f1905ff4d3$export$6d9c69b0de29b591(r3, o2) {
    var i3 = $fcff12f1905ff4d3$var$m($fcff12f1905ff4d3$var$t++, 3);
    !(0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__s && $fcff12f1905ff4d3$var$k(i3.__H, o2) && (i3.__ = r3, i3.__H = o2, $fcff12f1905ff4d3$var$u5.__H.__h.push(i3));
}
function $fcff12f1905ff4d3$export$e5c5a5f917a5871c(r4, o3) {
    var i4 = $fcff12f1905ff4d3$var$m($fcff12f1905ff4d3$var$t++, 4);
    !(0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__s && $fcff12f1905ff4d3$var$k(i4.__H, o3) && (i4.__ = r4, i4.__H = o3, $fcff12f1905ff4d3$var$u5.__h.push(i4));
}
function $fcff12f1905ff4d3$export$b8f5890fc79d6aca(n4) {
    return $fcff12f1905ff4d3$var$o = 5, $fcff12f1905ff4d3$export$1538c33de8887b59(function() {
        return {
            current: n4
        };
    }, []);
}
function $fcff12f1905ff4d3$export$d5a552a76deda3c2(n5, t3, u1) {
    $fcff12f1905ff4d3$var$o = 6, $fcff12f1905ff4d3$export$e5c5a5f917a5871c(function() {
        "function" == typeof n5 ? n5(t3()) : n5 && (n5.current = t3());
    }, null == u1 ? u1 : u1.concat(n5));
}
function $fcff12f1905ff4d3$export$1538c33de8887b59(n6, u2) {
    var r5 = $fcff12f1905ff4d3$var$m($fcff12f1905ff4d3$var$t++, 7);
    return $fcff12f1905ff4d3$var$k(r5.__H, u2) && (r5.__ = n6(), r5.__H = u2, r5.__h = n6), r5.__;
}
function $fcff12f1905ff4d3$export$35808ee640e87ca7(n7, t4) {
    return $fcff12f1905ff4d3$var$o = 8, $fcff12f1905ff4d3$export$1538c33de8887b59(function() {
        return n7;
    }, t4);
}
function $fcff12f1905ff4d3$export$fae74005e78b1a27(n8) {
    var r6 = $fcff12f1905ff4d3$var$u5.context[n8.__c], o4 = $fcff12f1905ff4d3$var$m($fcff12f1905ff4d3$var$t++, 9);
    return o4.c = n8, r6 ? (null == o4.__ && (o4.__ = !0, r6.sub($fcff12f1905ff4d3$var$u5)), r6.props.value) : n8.__;
}
function $fcff12f1905ff4d3$export$dc8fbce3eb94dc1e(t5, u3) {
    (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).useDebugValue && (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).useDebugValue(u3 ? u3(t5) : t5);
}
function $fcff12f1905ff4d3$export$c052f6604b7d51fe(n9) {
    var r7 = $fcff12f1905ff4d3$var$m($fcff12f1905ff4d3$var$t++, 10), o5 = $fcff12f1905ff4d3$export$60241385465d0a34();
    return r7.__ = n9, $fcff12f1905ff4d3$var$u5.componentDidCatch || ($fcff12f1905ff4d3$var$u5.componentDidCatch = function(n10) {
        r7.__ && r7.__(n10), o5[1](n10);
    }), [
        o5[0],
        function() {
            o5[1](void 0);
        }
    ];
}
function $fcff12f1905ff4d3$var$x() {
    var t6;
    for($fcff12f1905ff4d3$var$i.sort(function(n11, t7) {
        return n11.__v.__b - t7.__v.__b;
    }); t6 = $fcff12f1905ff4d3$var$i.pop();)if (t6.__P) try {
        t6.__H.__h.forEach($fcff12f1905ff4d3$var$g), t6.__H.__h.forEach($fcff12f1905ff4d3$var$j), t6.__H.__h = [];
    } catch (u4) {
        t6.__H.__h = [], (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__e(u4, t6.__v);
    }
}
(0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__b = function(n12) {
    $fcff12f1905ff4d3$var$u5 = null, $fcff12f1905ff4d3$var$c && $fcff12f1905ff4d3$var$c(n12);
}, (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__r = function(n13) {
    $fcff12f1905ff4d3$var$f && $fcff12f1905ff4d3$var$f(n13), $fcff12f1905ff4d3$var$t = 0;
    var r8 = ($fcff12f1905ff4d3$var$u5 = n13.__c).__H;
    r8 && (r8.__h.forEach($fcff12f1905ff4d3$var$g), r8.__h.forEach($fcff12f1905ff4d3$var$j), r8.__h = []);
}, (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).diffed = function(t8) {
    $fcff12f1905ff4d3$var$e && $fcff12f1905ff4d3$var$e(t8);
    var o6 = t8.__c;
    o6 && o6.__H && o6.__H.__h.length && (1 !== $fcff12f1905ff4d3$var$i.push(o6) && $fcff12f1905ff4d3$var$r === (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).requestAnimationFrame || (($fcff12f1905ff4d3$var$r = (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).requestAnimationFrame) || function(n14) {
        var _$t, u = function u() {
            clearTimeout(r9), $fcff12f1905ff4d3$var$b && cancelAnimationFrame(_$t), setTimeout(n14);
        }, r9 = setTimeout(u, 100);
        $fcff12f1905ff4d3$var$b && (_$t = requestAnimationFrame(u));
    })($fcff12f1905ff4d3$var$x)), $fcff12f1905ff4d3$var$u5 = null;
}, (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__c = function(t9, u) {
    u.some(function(t10) {
        try {
            t10.__h.forEach($fcff12f1905ff4d3$var$g), t10.__h = t10.__h.filter(function(n15) {
                return !n15.__ || $fcff12f1905ff4d3$var$j(n15);
            });
        } catch (r10) {
            u.some(function(n16) {
                n16.__h && (n16.__h = []);
            }), u = [], (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__e(r10, t10.__v);
        }
    }), $fcff12f1905ff4d3$var$a && $fcff12f1905ff4d3$var$a(t9, u);
}, (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).unmount = function(t11) {
    $fcff12f1905ff4d3$var$v && $fcff12f1905ff4d3$var$v(t11);
    var u, r11 = t11.__c;
    r11 && r11.__H && (r11.__H.__.forEach(function(n17) {
        try {
            $fcff12f1905ff4d3$var$g(n17);
        } catch (n18) {
            u = n18;
        }
    }), u && (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__e(u, r11.__v));
};
var $fcff12f1905ff4d3$var$b = "function" == typeof requestAnimationFrame;
function $fcff12f1905ff4d3$var$g(n19) {
    var t12 = $fcff12f1905ff4d3$var$u5, r12 = n19.__c;
    "function" == typeof r12 && (n19.__c = void 0, r12()), $fcff12f1905ff4d3$var$u5 = t12;
}
function $fcff12f1905ff4d3$var$j(n20) {
    var t13 = $fcff12f1905ff4d3$var$u5;
    n20.__c = n20.__(), $fcff12f1905ff4d3$var$u5 = t13;
}
function $fcff12f1905ff4d3$var$k(n21, t14) {
    return !n21 || n21.length !== t14.length || t14.some(function(t15, u) {
        return t15 !== n21[u];
    });
}
function $fcff12f1905ff4d3$var$w(n22, t16) {
    return "function" == typeof t16 ? t16(n22) : t16;
}





function $d7e5aa0d2b8fa1f1$var$S(n1, t1) {
    for(var _$e in t1)n1[_$e] = t1[_$e];
    return n1;
}
function $d7e5aa0d2b8fa1f1$var$C(n2, t2) {
    for(var _$e in n2)if ("__source" !== _$e && !(_$e in t2)) return !0;
    for(var _$r in t2)if ("__source" !== _$r && n2[_$r] !== t2[_$r]) return !0;
    return !1;
}
function $d7e5aa0d2b8fa1f1$export$221d75b3f55bb0bd(n3) {
    this.props = n3;
}
function $d7e5aa0d2b8fa1f1$export$7c73462e0d25e514(n4, t3) {
    function e1(n5) {
        var _$e = this.props.ref, _$r = _$e == n5.ref;
        return !_$r && _$e && (_$e.call ? _$e(null) : _$e.current = null), t3 ? !t3(this.props, n5) || !_$r : $d7e5aa0d2b8fa1f1$var$C(this.props, n5);
    }
    function r1(t4) {
        return this.shouldComponentUpdate = e1, (0, $d5fc6ac583bc94a1$export$c8a8987d4410bf2d)(n4, t4);
    }
    return r1.displayName = "Memo(" + (n4.displayName || n4.name) + ")", r1.prototype.isReactComponent = !0, r1.__f = !0, r1;
}
($d7e5aa0d2b8fa1f1$export$221d75b3f55bb0bd.prototype = new (0, $d5fc6ac583bc94a1$export$16fa2f45be04daa8)).isPureReactComponent = !0, $d7e5aa0d2b8fa1f1$export$221d75b3f55bb0bd.prototype.shouldComponentUpdate = function(n6, t5) {
    return $d7e5aa0d2b8fa1f1$var$C(this.props, n6) || $d7e5aa0d2b8fa1f1$var$C(this.state, t5);
};
var $d7e5aa0d2b8fa1f1$var$w = (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__b;
(0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__b = function(n7) {
    n7.type && n7.type.__f && n7.ref && (n7.props.ref = n7.ref, n7.ref = null), $d7e5aa0d2b8fa1f1$var$w && $d7e5aa0d2b8fa1f1$var$w(n7);
};
var $d7e5aa0d2b8fa1f1$var$R = "undefined" != typeof Symbol && Symbol.for && Symbol.for("react.forward_ref") || 3911;
function $d7e5aa0d2b8fa1f1$export$257a8862b851cb5b(n8) {
    function t6(t7, e2) {
        var _$r = $d7e5aa0d2b8fa1f1$var$S({}, t7);
        return delete _$r.ref, n8(_$r, (e2 = t7.ref || e2) && ("object" != typeof e2 || "current" in e2) ? e2 : null);
    }
    return t6.$$typeof = $d7e5aa0d2b8fa1f1$var$R, t6.render = t6, t6.prototype.isReactComponent = t6.__f = !0, t6.displayName = "ForwardRef(" + (n8.displayName || n8.name) + ")", t6;
}
var $d7e5aa0d2b8fa1f1$var$N = function N(n9, t8) {
    return null == n9 ? null : (0, $d5fc6ac583bc94a1$export$47e4c5b300681277)((0, $d5fc6ac583bc94a1$export$47e4c5b300681277)(n9).map(t8));
}, $d7e5aa0d2b8fa1f1$export$dca3b0875bd9a954 = {
    map: $d7e5aa0d2b8fa1f1$var$N,
    forEach: $d7e5aa0d2b8fa1f1$var$N,
    count: function count(n10) {
        return n10 ? (0, $d5fc6ac583bc94a1$export$47e4c5b300681277)(n10).length : 0;
    },
    only: function only(n11) {
        var _$t = (0, $d5fc6ac583bc94a1$export$47e4c5b300681277)(n11);
        if (1 !== _$t.length) throw "Children.only";
        return _$t[0];
    },
    toArray: (0, $d5fc6ac583bc94a1$export$47e4c5b300681277)
}, $d7e5aa0d2b8fa1f1$var$A = (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__e;
(0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__e = function(n12, t9, e3) {
    if (n12.then) {
        for(var _$r, _$u = t9; _$u = _$u.__;)if ((_$r = _$u.__c) && _$r.__c) return null == t9.__e && (t9.__e = e3.__e, t9.__k = e3.__k), _$r.__c(n12, t9);
    }
    $d7e5aa0d2b8fa1f1$var$A(n12, t9, e3);
};
var $d7e5aa0d2b8fa1f1$var$O = (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).unmount;
function $d7e5aa0d2b8fa1f1$export$74bf444e3cd11ea5() {
    this.__u = 0, this.t = null, this.__b = null;
}
function $d7e5aa0d2b8fa1f1$var$U(n13) {
    var _$t = n13.__.__c;
    return _$t && _$t.__e && _$t.__e(n13);
}
function $d7e5aa0d2b8fa1f1$export$488013bae63b21da(n14) {
    var _$t, _$e, _$r;
    function u1(u2) {
        if (_$t || (_$t = n14()).then(function(n15) {
            _$e = n15.default || n15;
        }, function(n16) {
            _$r = n16;
        }), _$r) throw _$r;
        if (!_$e) throw _$t;
        return (0, $d5fc6ac583bc94a1$export$c8a8987d4410bf2d)(_$e, u2);
    }
    return u1.displayName = "Lazy", u1.__f = !0, u1;
}
function $d7e5aa0d2b8fa1f1$export$998bcd577473dd93() {
    this.u = null, this.o = null;
}
(0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).unmount = function(n17) {
    var _$t = n17.__c;
    _$t && _$t.__R && _$t.__R(), _$t && !0 === n17.__h && (n17.type = null), $d7e5aa0d2b8fa1f1$var$O && $d7e5aa0d2b8fa1f1$var$O(n17);
}, ($d7e5aa0d2b8fa1f1$export$74bf444e3cd11ea5.prototype = new (0, $d5fc6ac583bc94a1$export$16fa2f45be04daa8)).__c = function(n18, t10) {
    var _$e = t10.__c, _$r = this;
    null == _$r.t && (_$r.t = []), _$r.t.push(_$e);
    var _$u = $d7e5aa0d2b8fa1f1$var$U(_$r.__v), _$o = !1, _$i = function _$i() {
        _$o || (_$o = !0, _$e.__R = null, _$u ? _$u(_$l) : _$l());
    };
    _$e.__R = _$i;
    var _$l = function _$l() {
        if (!--_$r.__u) {
            if (_$r.state.__e) {
                var _$n = _$r.state.__e;
                _$r.__v.__k[0] = function n19(t11, e4, r2) {
                    return t11 && (t11.__v = null, t11.__k = t11.__k && t11.__k.map(function(t12) {
                        return n19(t12, e4, r2);
                    }), t11.__c && t11.__c.__P === e4 && (t11.__e && r2.insertBefore(t11.__e, t11.__d), t11.__c.__e = !0, t11.__c.__P = r2)), t11;
                }(_$n, _$n.__c.__P, _$n.__c.__O);
            }
            var _$t;
            for(_$r.setState({
                __e: _$r.__b = null
            }); _$t = _$r.t.pop();)_$t.forceUpdate();
        }
    }, _$c = !0 === t10.__h;
    (_$r.__u++) || _$c || _$r.setState({
        __e: _$r.__b = _$r.__v.__k[0]
    }), n18.then(_$i, _$i);
}, $d7e5aa0d2b8fa1f1$export$74bf444e3cd11ea5.prototype.componentWillUnmount = function() {
    this.t = [];
}, $d7e5aa0d2b8fa1f1$export$74bf444e3cd11ea5.prototype.render = function(n20, t13) {
    if (this.__b) {
        if (this.__v.__k) {
            var _$e = document.createElement("div"), _$r = this.__v.__k[0].__c;
            this.__v.__k[0] = function n21(t14, e5, r3) {
                return t14 && (t14.__c && t14.__c.__H && (t14.__c.__H.__.forEach(function(n22) {
                    "function" == typeof n22.__c && n22.__c();
                }), t14.__c.__H = null), null != (t14 = $d7e5aa0d2b8fa1f1$var$S({}, t14)).__c && (t14.__c.__P === r3 && (t14.__c.__P = e5), t14.__c = null), t14.__k = t14.__k && t14.__k.map(function(t15) {
                    return n21(t15, e5, r3);
                })), t14;
            }(this.__b, _$e, _$r.__O = _$r.__P);
        }
        this.__b = null;
    }
    var _$u = t13.__e && (0, $d5fc6ac583bc94a1$export$c8a8987d4410bf2d)((0, $d5fc6ac583bc94a1$export$ffb0004e005737fa), null, n20.fallback);
    return _$u && (_$u.__h = null), [
        (0, $d5fc6ac583bc94a1$export$c8a8987d4410bf2d)((0, $d5fc6ac583bc94a1$export$ffb0004e005737fa), null, t13.__e ? null : n20.children),
        _$u
    ];
};
var $d7e5aa0d2b8fa1f1$var$T = function T(n23, t16, e6) {
    if (++e6[1] === e6[0] && n23.o.delete(t16), n23.props.revealOrder && ("t" !== n23.props.revealOrder[0] || !n23.o.size)) for(e6 = n23.u; e6;){
        for(; e6.length > 3;)e6.pop()();
        if (e6[1] < e6[0]) break;
        n23.u = e6 = e6[2];
    }
};
function $d7e5aa0d2b8fa1f1$var$D(n24) {
    return this.getChildContext = function() {
        return n24.context;
    }, n24.children;
}
function $d7e5aa0d2b8fa1f1$var$I(n25) {
    var _$t = this, _$e = n25.i;
    _$t.componentWillUnmount = function() {
        (0, $d5fc6ac583bc94a1$export$b3890eb0ae9dca99)(null, _$t.l), _$t.l = null, _$t.i = null;
    }, _$t.i && _$t.i !== _$e && _$t.componentWillUnmount(), n25.__v ? (_$t.l || (_$t.i = _$e, _$t.l = {
        nodeType: 1,
        parentNode: _$e,
        childNodes: [],
        appendChild: function appendChild(n26) {
            this.childNodes.push(n26), _$t.i.appendChild(n26);
        },
        insertBefore: function insertBefore(n27, e) {
            this.childNodes.push(n27), _$t.i.appendChild(n27);
        },
        removeChild: function removeChild(n28) {
            this.childNodes.splice(this.childNodes.indexOf(n28) >>> 1, 1), _$t.i.removeChild(n28);
        }
    }), (0, $d5fc6ac583bc94a1$export$b3890eb0ae9dca99)((0, $d5fc6ac583bc94a1$export$c8a8987d4410bf2d)($d7e5aa0d2b8fa1f1$var$D, {
        context: _$t.context
    }, n25.__v), _$t.l)) : _$t.l && _$t.componentWillUnmount();
}
function $d7e5aa0d2b8fa1f1$export$d39a5bbd09211389(n29, t17) {
    return (0, $d5fc6ac583bc94a1$export$c8a8987d4410bf2d)($d7e5aa0d2b8fa1f1$var$I, {
        __v: n29,
        i: t17
    });
}
($d7e5aa0d2b8fa1f1$export$998bcd577473dd93.prototype = new (0, $d5fc6ac583bc94a1$export$16fa2f45be04daa8)).__e = function(n30) {
    var _$t = this, _$e = $d7e5aa0d2b8fa1f1$var$U(_$t.__v), _$r = _$t.o.get(n30);
    return _$r[0]++, function(u3) {
        var _$o = function _$o() {
            _$t.props.revealOrder ? (_$r.push(u3), $d7e5aa0d2b8fa1f1$var$T(_$t, n30, _$r)) : u3();
        };
        _$e ? _$e(_$o) : _$o();
    };
}, $d7e5aa0d2b8fa1f1$export$998bcd577473dd93.prototype.render = function(n31) {
    this.u = null, this.o = new Map;
    var _$t = (0, $d5fc6ac583bc94a1$export$47e4c5b300681277)(n31.children);
    n31.revealOrder && "b" === n31.revealOrder[0] && _$t.reverse();
    for(var _$e = _$t.length; _$e--;)this.o.set(_$t[_$e], this.u = [
        1,
        0,
        this.u
    ]);
    return n31.children;
}, $d7e5aa0d2b8fa1f1$export$998bcd577473dd93.prototype.componentDidUpdate = $d7e5aa0d2b8fa1f1$export$998bcd577473dd93.prototype.componentDidMount = function() {
    var _$n = this;
    this.o.forEach(function(t18, e7) {
        $d7e5aa0d2b8fa1f1$var$T(_$n, e7, t18);
    });
};
var $d7e5aa0d2b8fa1f1$var$j = "undefined" != typeof Symbol && Symbol.for && Symbol.for("react.element") || 60103, $d7e5aa0d2b8fa1f1$var$P = /^(?:accent|alignment|arabic|baseline|cap|clip(?!PathU)|color|dominant|fill|flood|font|glyph(?!R)|horiz|marker(?!H|W|U)|overline|paint|stop|strikethrough|stroke|text(?!L)|underline|unicode|units|v|vector|vert|word|writing|x(?!C))[A-Z]/, $d7e5aa0d2b8fa1f1$var$V = "undefined" != typeof document, $d7e5aa0d2b8fa1f1$var$z = function z(n32) {
    return ("undefined" != typeof Symbol && "symbol" == (0, (/*@__PURE__*/$parcel$interopDefault($hdvdM)))(Symbol()) ? /fil|che|rad/i : /fil|che|ra/i).test(n32);
};
function $d7e5aa0d2b8fa1f1$export$b3890eb0ae9dca99(n33, t19, e8) {
    return null == t19.__k && (t19.textContent = ""), (0, $d5fc6ac583bc94a1$export$b3890eb0ae9dca99)(n33, t19), "function" == typeof e8 && e8(), n33 ? n33.__c : null;
}
function $d7e5aa0d2b8fa1f1$export$fa8d919ba61d84db(n34, t20, e9) {
    return (0, $d5fc6ac583bc94a1$export$fa8d919ba61d84db)(n34, t20), "function" == typeof e9 && e9(), n34 ? n34.__c : null;
}
(0, $d5fc6ac583bc94a1$export$16fa2f45be04daa8).prototype.isReactComponent = {}, [
    "componentWillMount",
    "componentWillReceiveProps",
    "componentWillUpdate"
].forEach(function(n35) {
    Object.defineProperty((0, $d5fc6ac583bc94a1$export$16fa2f45be04daa8).prototype, n35, {
        configurable: !0,
        get: function get() {
            return this["UNSAFE_" + n35];
        },
        set: function set(t21) {
            Object.defineProperty(this, n35, {
                configurable: !0,
                writable: !0,
                value: t21
            });
        }
    });
});
var $d7e5aa0d2b8fa1f1$var$H = (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).event;
function $d7e5aa0d2b8fa1f1$var$Z() {}
function $d7e5aa0d2b8fa1f1$var$Y() {
    return this.cancelBubble;
}
function $d7e5aa0d2b8fa1f1$var$q() {
    return this.defaultPrevented;
}
(0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).event = function(n36) {
    return $d7e5aa0d2b8fa1f1$var$H && (n36 = $d7e5aa0d2b8fa1f1$var$H(n36)), n36.persist = $d7e5aa0d2b8fa1f1$var$Z, n36.isPropagationStopped = $d7e5aa0d2b8fa1f1$var$Y, n36.isDefaultPrevented = $d7e5aa0d2b8fa1f1$var$q, n36.nativeEvent = n36;
};
var $d7e5aa0d2b8fa1f1$var$G, $d7e5aa0d2b8fa1f1$var$J = {
    configurable: !0,
    get: function get() {
        return this.class;
    }
}, $d7e5aa0d2b8fa1f1$var$K = (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).vnode;
(0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).vnode = function(n37) {
    var _$t = n37.type, _$e = n37.props, _$r = _$e;
    if ("string" == typeof _$t) {
        var _$u = -1 === _$t.indexOf("-");
        for(var _$o in _$r = {}, _$e){
            var _$i = _$e[_$o];
            $d7e5aa0d2b8fa1f1$var$V && "children" === _$o && "noscript" === _$t || "value" === _$o && "defaultValue" in _$e && null == _$i || ("defaultValue" === _$o && "value" in _$e && null == _$e.value ? _$o = "value" : "download" === _$o && !0 === _$i ? _$i = "" : /ondoubleclick/i.test(_$o) ? _$o = "ondblclick" : /^onchange(textarea|input)/i.test(_$o + _$t) && !$d7e5aa0d2b8fa1f1$var$z(_$e.type) ? _$o = "oninput" : /^onfocus$/i.test(_$o) ? _$o = "onfocusin" : /^onblur$/i.test(_$o) ? _$o = "onfocusout" : /^on(Ani|Tra|Tou|BeforeInp)/.test(_$o) ? _$o = _$o.toLowerCase() : _$u && $d7e5aa0d2b8fa1f1$var$P.test(_$o) ? _$o = _$o.replace(/[A-Z0-9]/, "-$&").toLowerCase() : null === _$i && (_$i = void 0), _$r[_$o] = _$i);
        }
        "select" == _$t && _$r.multiple && Array.isArray(_$r.value) && (_$r.value = (0, $d5fc6ac583bc94a1$export$47e4c5b300681277)(_$e.children).forEach(function(n38) {
            n38.props.selected = -1 != _$r.value.indexOf(n38.props.value);
        })), "select" == _$t && null != _$r.defaultValue && (_$r.value = (0, $d5fc6ac583bc94a1$export$47e4c5b300681277)(_$e.children).forEach(function(n39) {
            n39.props.selected = _$r.multiple ? -1 != _$r.defaultValue.indexOf(n39.props.value) : _$r.defaultValue == n39.props.value;
        })), n37.props = _$r, _$e.class != _$e.className && ($d7e5aa0d2b8fa1f1$var$J.enumerable = "className" in _$e, null != _$e.className && (_$r.class = _$e.className), Object.defineProperty(_$r, "className", $d7e5aa0d2b8fa1f1$var$J));
    }
    n37.$$typeof = $d7e5aa0d2b8fa1f1$var$j, $d7e5aa0d2b8fa1f1$var$K && $d7e5aa0d2b8fa1f1$var$K(n37);
};
var $d7e5aa0d2b8fa1f1$var$Q = (0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__r;
(0, $d5fc6ac583bc94a1$export$41c562ebe57d11e2).__r = function(n40) {
    $d7e5aa0d2b8fa1f1$var$Q && $d7e5aa0d2b8fa1f1$var$Q(n40), $d7e5aa0d2b8fa1f1$var$G = n40.__c;
};
var $d7e5aa0d2b8fa1f1$export$ae55be85d98224ed = {
    ReactCurrentDispatcher: {
        current: {
            readContext: function readContext(n41) {
                return $d7e5aa0d2b8fa1f1$var$G.__n[n41.__c].props.value;
            }
        }
    }
}, $d7e5aa0d2b8fa1f1$export$83d89fbfd8236492 = "17.0.2";
function $d7e5aa0d2b8fa1f1$export$d38cd72104c1f0e9(n42) {
    return (0, $d5fc6ac583bc94a1$export$c8a8987d4410bf2d).bind(null, n42);
}
function $d7e5aa0d2b8fa1f1$export$a8257692ac88316c(n43) {
    return !!n43 && n43.$$typeof === $d7e5aa0d2b8fa1f1$var$j;
}
function $d7e5aa0d2b8fa1f1$export$e530037191fcd5d7(n44) {
    return $d7e5aa0d2b8fa1f1$export$a8257692ac88316c(n44) ? (0, $d5fc6ac583bc94a1$export$e530037191fcd5d7).apply(null, arguments) : n44;
}
function $d7e5aa0d2b8fa1f1$export$502457920280e6be(n45) {
    return !!n45.__k && ((0, $d5fc6ac583bc94a1$export$b3890eb0ae9dca99)(null, n45), !0);
}
function $d7e5aa0d2b8fa1f1$export$466bfc07425424d5(n46) {
    return n46 && (n46.base || 1 === n46.nodeType && n46) || null;
}
var $d7e5aa0d2b8fa1f1$export$c78a37762a8d58e1 = function ln(n47, t22) {
    return n47(t22);
}, $d7e5aa0d2b8fa1f1$export$cd75ccfd720a3cd4 = function cn(n48, t23) {
    return n48(t23);
}, $d7e5aa0d2b8fa1f1$export$5f8d39834fd61797 = (0, $d5fc6ac583bc94a1$export$ffb0004e005737fa);
var $d7e5aa0d2b8fa1f1$export$2e2bcd8739ae039 = {
    useState: (0, $fcff12f1905ff4d3$export$60241385465d0a34),
    useReducer: (0, $fcff12f1905ff4d3$export$13e3392192263954),
    useEffect: (0, $fcff12f1905ff4d3$export$6d9c69b0de29b591),
    useLayoutEffect: (0, $fcff12f1905ff4d3$export$e5c5a5f917a5871c),
    useRef: (0, $fcff12f1905ff4d3$export$b8f5890fc79d6aca),
    useImperativeHandle: (0, $fcff12f1905ff4d3$export$d5a552a76deda3c2),
    useMemo: (0, $fcff12f1905ff4d3$export$1538c33de8887b59),
    useCallback: (0, $fcff12f1905ff4d3$export$35808ee640e87ca7),
    useContext: (0, $fcff12f1905ff4d3$export$fae74005e78b1a27),
    useDebugValue: (0, $fcff12f1905ff4d3$export$dc8fbce3eb94dc1e),
    version: "17.0.2",
    Children: $d7e5aa0d2b8fa1f1$export$dca3b0875bd9a954,
    render: $d7e5aa0d2b8fa1f1$export$b3890eb0ae9dca99,
    hydrate: $d7e5aa0d2b8fa1f1$export$fa8d919ba61d84db,
    unmountComponentAtNode: $d7e5aa0d2b8fa1f1$export$502457920280e6be,
    createPortal: $d7e5aa0d2b8fa1f1$export$d39a5bbd09211389,
    createElement: (0, $d5fc6ac583bc94a1$export$c8a8987d4410bf2d),
    createContext: (0, $d5fc6ac583bc94a1$export$fd42f52fd3ae1109),
    createFactory: $d7e5aa0d2b8fa1f1$export$d38cd72104c1f0e9,
    cloneElement: $d7e5aa0d2b8fa1f1$export$e530037191fcd5d7,
    createRef: (0, $d5fc6ac583bc94a1$export$7d1e3a5e95ceca43),
    Fragment: (0, $d5fc6ac583bc94a1$export$ffb0004e005737fa),
    isValidElement: $d7e5aa0d2b8fa1f1$export$a8257692ac88316c,
    findDOMNode: $d7e5aa0d2b8fa1f1$export$466bfc07425424d5,
    Component: (0, $d5fc6ac583bc94a1$export$16fa2f45be04daa8),
    PureComponent: $d7e5aa0d2b8fa1f1$export$221d75b3f55bb0bd,
    memo: $d7e5aa0d2b8fa1f1$export$7c73462e0d25e514,
    forwardRef: $d7e5aa0d2b8fa1f1$export$257a8862b851cb5b,
    flushSync: $d7e5aa0d2b8fa1f1$export$cd75ccfd720a3cd4,
    unstable_batchedUpdates: $d7e5aa0d2b8fa1f1$export$c78a37762a8d58e1,
    StrictMode: (0, $d5fc6ac583bc94a1$export$ffb0004e005737fa),
    Suspense: $d7e5aa0d2b8fa1f1$export$74bf444e3cd11ea5,
    SuspenseList: $d7e5aa0d2b8fa1f1$export$998bcd577473dd93,
    lazy: $d7e5aa0d2b8fa1f1$export$488013bae63b21da,
    __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: $d7e5aa0d2b8fa1f1$export$ae55be85d98224ed
};




var $48caf7705e9bdcb5$var$THEME_ICONS = {
    light: "outline",
    dark: "solid"
};
var $48caf7705e9bdcb5$export$2e2bcd8739ae039 = /*#__PURE__*/ function(PureComponent1) {
    "use strict";
    (0, (/*@__PURE__*/$parcel$interopDefault($668009e4f1a1d720$exports)))(Navigation, PureComponent1);
    var _super = (0, (/*@__PURE__*/$parcel$interopDefault($a72404fd66b37813$exports)))(Navigation);
    function Navigation() {
        (0, (/*@__PURE__*/$parcel$interopDefault($aceb8ee155713853$exports)))(this, Navigation);
        var _this;
        _this = _super.call(this);
        _this.categories = (0, $47b4a70d4572a3b3$export$2d0294657ab35f1b).categories.filter(function(category) {
            return !category.target;
        });
        _this.state = {
            categoryId: _this.categories[0].id
        };
        return _this;
    }
    (0, (/*@__PURE__*/$parcel$interopDefault($bf5a3d69977e47ef$exports)))(Navigation, [
        {
            key: "renderIcon",
            value: function renderIcon(category) {
                var icon = category.icon;
                if (icon) {
                    if (icon.svg) return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("span", {
                        class: "flex",
                        dangerouslySetInnerHTML: {
                            __html: icon.svg
                        }
                    });
                    if (icon.src) return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("img", {
                        src: icon.src
                    });
                }
                var categoryIcons = (0, $b9ae2abd9272dd52$export$2e2bcd8739ae039).categories[category.id] || (0, $b9ae2abd9272dd52$export$2e2bcd8739ae039).categories.custom;
                var style = this.props.icons == "auto" ? $48caf7705e9bdcb5$var$THEME_ICONS[this.props.theme] : this.props.icons;
                return categoryIcons[style] || categoryIcons;
            }
        },
        {
            key: "render",
            value: function render() {
                var _this = this;
                var selectedCategoryIndex = null;
                return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("nav", {
                    id: "nav",
                    class: "padding",
                    "data-position": this.props.position,
                    dir: this.props.dir,
                    children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                        class: "flex relative",
                        children: [
                            this.categories.map(function(category, i) {
                                var _this1 = _this;
                                var title = category.name || (0, $47b4a70d4572a3b3$export$dbe3113d60765c1a).categories[category.id];
                                var selected = !_this.props.unfocused && category.id == _this.state.categoryId;
                                if (selected) selectedCategoryIndex = i;
                                return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("button", {
                                    "aria-label": title,
                                    "aria-selected": selected || undefined,
                                    title: title,
                                    type: "button",
                                    class: "flex flex-grow flex-center",
                                    onMouseDown: function(e) {
                                        return e.preventDefault();
                                    },
                                    onClick: function() {
                                        _this1.props.onClick({
                                            category: category,
                                            i: i
                                        });
                                    },
                                    children: _this.renderIcon(category)
                                });
                            }),
                            /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                class: "bar",
                                style: {
                                    width: "".concat(100 / this.categories.length, "%"),
                                    opacity: selectedCategoryIndex == null ? 0 : 1,
                                    transform: this.props.dir === "rtl" ? "scaleX(-1) translateX(".concat(selectedCategoryIndex * 100, "%)") : "translateX(".concat(selectedCategoryIndex * 100, "%)")
                                }
                            })
                        ]
                    })
                });
            }
        }
    ]);
    return Navigation;
}((0, $d7e5aa0d2b8fa1f1$export$221d75b3f55bb0bd));









var $caeffba843b1695e$export$2e2bcd8739ae039 = /*#__PURE__*/ function(PureComponent1) {
    "use strict";
    (0, (/*@__PURE__*/$parcel$interopDefault($668009e4f1a1d720$exports)))(PureInlineComponent, PureComponent1);
    var _super = (0, (/*@__PURE__*/$parcel$interopDefault($a72404fd66b37813$exports)))(PureInlineComponent);
    function PureInlineComponent() {
        (0, (/*@__PURE__*/$parcel$interopDefault($aceb8ee155713853$exports)))(this, PureInlineComponent);
        return _super.apply(this, arguments);
    }
    (0, (/*@__PURE__*/$parcel$interopDefault($bf5a3d69977e47ef$exports)))(PureInlineComponent, [
        {
            key: "shouldComponentUpdate",
            value: function shouldComponentUpdate(nextProps) {
                for(var k in nextProps){
                    if (k == "children") continue;
                    if (nextProps[k] != this.props[k]) return true;
                }
                return false;
            }
        },
        {
            key: "render",
            value: function render() {
                return this.props.children;
            }
        }
    ]);
    return PureInlineComponent;
}((0, $d7e5aa0d2b8fa1f1$export$221d75b3f55bb0bd));




var $75afa6943437e26f$var$Performance = {
    rowsPerRender: 10
};
var $75afa6943437e26f$export$2e2bcd8739ae039 = /*#__PURE__*/ function(Component1) {
    "use strict";
    (0, (/*@__PURE__*/$parcel$interopDefault($668009e4f1a1d720$exports)))(Picker, Component1);
    var _super = (0, (/*@__PURE__*/$parcel$interopDefault($a72404fd66b37813$exports)))(Picker);
    function Picker(props) {
        (0, (/*@__PURE__*/$parcel$interopDefault($aceb8ee155713853$exports)))(this, Picker);
        var _this;
        _this = _super.call(this);
        (0, (/*@__PURE__*/$parcel$interopDefault($gntqc)))((0, (/*@__PURE__*/$parcel$interopDefault($5MCow)))(_this), "darkMediaCallback", function() {
            if (_this.props.theme != "auto") return;
            _this.setState({
                theme: _this.darkMedia.matches ? "dark" : "light"
            });
        });
        (0, (/*@__PURE__*/$parcel$interopDefault($gntqc)))((0, (/*@__PURE__*/$parcel$interopDefault($5MCow)))(_this), "handleClickOutside", function(e) {
            var element = _this.props.element;
            if (e.target != element) {
                if (_this.state.showSkins) _this.closeSkins();
                if (_this.props.onClickOutside) _this.props.onClickOutside(e);
            }
        });
        (0, (/*@__PURE__*/$parcel$interopDefault($gntqc)))((0, (/*@__PURE__*/$parcel$interopDefault($5MCow)))(_this), "handleBaseClick", function(e) {
            if (!_this.state.showSkins) return;
            if (!e.target.closest(".menu")) {
                e.preventDefault();
                e.stopImmediatePropagation();
                _this.closeSkins();
            }
        });
        (0, (/*@__PURE__*/$parcel$interopDefault($gntqc)))((0, (/*@__PURE__*/$parcel$interopDefault($5MCow)))(_this), "handleBaseKeydown", function(e) {
            if (!_this.state.showSkins) return;
            if (e.key == "Escape") {
                e.preventDefault();
                e.stopImmediatePropagation();
                _this.closeSkins();
            }
        });
        (0, (/*@__PURE__*/$parcel$interopDefault($gntqc)))((0, (/*@__PURE__*/$parcel$interopDefault($5MCow)))(_this), "handleSearchClick", function() {
            var emoji = _this.getEmojiByPos(_this.state.pos);
            if (!emoji) return;
            _this.setState({
                pos: [
                    -1,
                    -1
                ]
            });
        });
        var _this1 = (0, (/*@__PURE__*/$parcel$interopDefault($5MCow)))(_this);
        (0, (/*@__PURE__*/$parcel$interopDefault($gntqc)))((0, (/*@__PURE__*/$parcel$interopDefault($5MCow)))(_this), "handleSearchInput", (0, (/*@__PURE__*/$parcel$interopDefault($f653aaea2ce76311$exports)))((0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).mark(function _callee() {
            var input, value, searchResults, afterRender, pos, grid, row, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, emoji;
            return (0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).wrap(function _callee$(_ctx) {
                while(1)switch(_ctx.prev = _ctx.next){
                    case 0:
                        input = _this1.refs.searchInput.current;
                        if (input) {
                            _ctx.next = 3;
                            break;
                        }
                        return _ctx.abrupt("return");
                    case 3:
                        value = input.value;
                        _ctx.next = 6;
                        return (0, $022b4a7de802d8eb$export$2e2bcd8739ae039).search(value);
                    case 6:
                        searchResults = _ctx.sent;
                        afterRender = function() {
                            if (!_this1.refs.scroll.current) return;
                            _this1.refs.scroll.current.scrollTop = 0;
                        };
                        if (searchResults) {
                            _ctx.next = 10;
                            break;
                        }
                        return _ctx.abrupt("return", _this1.setState({
                            searchResults: searchResults,
                            pos: [
                                -1,
                                -1
                            ]
                        }, afterRender));
                    case 10:
                        pos = input.selectionStart == input.value.length ? [
                            0,
                            0
                        ] : [
                            -1,
                            -1
                        ];
                        grid = [];
                        grid.setsize = searchResults.length;
                        row = null;
                        _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                        _ctx.prev = 15;
                        for(_iterator = searchResults[Symbol.iterator](); !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                            emoji = _step.value;
                            if (!grid.length || row.length == _this1.getPerLine()) {
                                row = [];
                                row.__categoryId = "search";
                                row.__index = grid.length;
                                grid.push(row);
                            }
                            row.push(emoji);
                        }
                        _ctx.next = 23;
                        break;
                    case 19:
                        _ctx.prev = 19;
                        _ctx.t0 = _ctx["catch"](15);
                        _didIteratorError = true;
                        _iteratorError = _ctx.t0;
                    case 23:
                        _ctx.prev = 23;
                        _ctx.prev = 24;
                        if (!_iteratorNormalCompletion && _iterator.return != null) {
                            _iterator.return();
                        }
                    case 26:
                        _ctx.prev = 26;
                        if (!_didIteratorError) {
                            _ctx.next = 29;
                            break;
                        }
                        throw _iteratorError;
                    case 29:
                        return _ctx.finish(26);
                    case 30:
                        return _ctx.finish(23);
                    case 31:
                        _this1.ignoreMouse();
                        _this1.setState({
                            searchResults: grid,
                            pos: pos
                        }, afterRender);
                    case 33:
                    case "end":
                        return _ctx.stop();
                }
            }, _callee, null, [
                [
                    15,
                    19,
                    23,
                    31
                ],
                [
                    24,
                    ,
                    26,
                    30
                ]
            ]);
        })));
        (0, (/*@__PURE__*/$parcel$interopDefault($gntqc)))((0, (/*@__PURE__*/$parcel$interopDefault($5MCow)))(_this), "handleSearchKeyDown", function(e) {
            // const specialKey = e.altKey || e.ctrlKey || e.metaKey
            var input = e.currentTarget;
            e.stopImmediatePropagation();
            switch(e.key){
                case "ArrowLeft":
                    // if (specialKey) return
                    // e.preventDefault()
                    _this.navigate({
                        e: e,
                        input: input,
                        left: true
                    });
                    break;
                case "ArrowRight":
                    // if (specialKey) return
                    // e.preventDefault()
                    _this.navigate({
                        e: e,
                        input: input,
                        right: true
                    });
                    break;
                case "ArrowUp":
                    // if (specialKey) return
                    // e.preventDefault()
                    _this.navigate({
                        e: e,
                        input: input,
                        up: true
                    });
                    break;
                case "ArrowDown":
                    // if (specialKey) return
                    // e.preventDefault()
                    _this.navigate({
                        e: e,
                        input: input,
                        down: true
                    });
                    break;
                case "Enter":
                    e.preventDefault();
                    _this.handleEmojiClick({
                        e: e,
                        pos: _this.state.pos
                    });
                    break;
                case "Escape":
                    e.preventDefault();
                    if (_this.state.searchResults) _this.clearSearch();
                    else _this.unfocusSearch();
                    break;
                default:
                    break;
            }
        });
        (0, (/*@__PURE__*/$parcel$interopDefault($gntqc)))((0, (/*@__PURE__*/$parcel$interopDefault($5MCow)))(_this), "clearSearch", function() {
            var input = _this.refs.searchInput.current;
            if (!input) return;
            input.value = "";
            input.focus();
            _this.handleSearchInput();
        });
        (0, (/*@__PURE__*/$parcel$interopDefault($gntqc)))((0, (/*@__PURE__*/$parcel$interopDefault($5MCow)))(_this), "handleCategoryClick", function(param) {
            var category = param.category, i = param.i;
            _this.scrollTo(i == 0 ? {
                row: -1
            } : {
                categoryId: category.id
            });
        });
        (0, (/*@__PURE__*/$parcel$interopDefault($gntqc)))((0, (/*@__PURE__*/$parcel$interopDefault($5MCow)))(_this), "openSkins", function(e) {
            var currentTarget = e.currentTarget;
            var rect = currentTarget.getBoundingClientRect();
            var _this2 = (0, (/*@__PURE__*/$parcel$interopDefault($5MCow)))(_this);
            _this.setState({
                showSkins: rect
            }, (0, (/*@__PURE__*/$parcel$interopDefault($f653aaea2ce76311$exports)))((0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).mark(function _callee() {
                var menu;
                return (0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).wrap(function _callee$(_ctx) {
                    while(1)switch(_ctx.prev = _ctx.next){
                        case 0:
                            _ctx.next = 2;
                            return (0, $0542300b6c56b62c$export$e772c8ff12451969)(2);
                        case 2:
                            menu = _this2.refs.menu.current;
                            if (menu) {
                                _ctx.next = 5;
                                break;
                            }
                            return _ctx.abrupt("return");
                        case 5:
                            menu.classList.remove("hidden");
                            _this2.refs.skinToneRadio.current.focus();
                            _this2.base.addEventListener("click", _this2.handleBaseClick, true);
                            _this2.base.addEventListener("keydown", _this2.handleBaseKeydown, true);
                        case 9:
                        case "end":
                            return _ctx.stop();
                    }
                }, _callee);
            })));
        });
        _this.observers = [];
        _this.state = (0, (/*@__PURE__*/$parcel$interopDefault($06c6b18a6115d5f3$exports)))({
            pos: [
                -1,
                -1
            ],
            perLine: _this.initDynamicPerLine(props),
            visibleRows: {
                0: true
            }
        }, _this.getInitialState(props));
        return _this;
    }
    (0, (/*@__PURE__*/$parcel$interopDefault($bf5a3d69977e47ef$exports)))(Picker, [
        {
            key: "getInitialState",
            value: function getInitialState() {
                var props = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : this.props;
                return {
                    skin: (0, $000e3cabb83607f9$export$2e2bcd8739ae039).get("skin") || props.skin,
                    theme: this.initTheme(props.theme)
                };
            }
        },
        {
            key: "componentWillMount",
            value: function componentWillMount() {
                this.dir = (0, $47b4a70d4572a3b3$export$dbe3113d60765c1a).rtl ? "rtl" : "ltr";
                this.refs = {
                    menu: (0, $d5fc6ac583bc94a1$export$7d1e3a5e95ceca43)(),
                    navigation: (0, $d5fc6ac583bc94a1$export$7d1e3a5e95ceca43)(),
                    scroll: (0, $d5fc6ac583bc94a1$export$7d1e3a5e95ceca43)(),
                    search: (0, $d5fc6ac583bc94a1$export$7d1e3a5e95ceca43)(),
                    searchInput: (0, $d5fc6ac583bc94a1$export$7d1e3a5e95ceca43)(),
                    skinToneButton: (0, $d5fc6ac583bc94a1$export$7d1e3a5e95ceca43)(),
                    skinToneRadio: (0, $d5fc6ac583bc94a1$export$7d1e3a5e95ceca43)()
                };
                this.initGrid();
                if (this.props.stickySearch == false && this.props.searchPosition == "sticky") {
                    console.warn("[EmojiMart] Deprecation warning: `stickySearch` has been renamed `searchPosition`.");
                    this.props.searchPosition = "static";
                }
            }
        },
        {
            key: "componentDidMount",
            value: function componentDidMount() {
                this.register();
                this.shadowRoot = this.base.parentNode;
                if (this.props.autoFocus) {
                    var searchInput = this.refs.searchInput;
                    if (searchInput.current) searchInput.current.focus();
                }
            }
        },
        {
            key: "componentWillReceiveProps",
            value: function componentWillReceiveProps(nextProps) {
                var _this = this;
                this.nextState || (this.nextState = {});
                for(var k1 in nextProps)this.nextState[k1] = nextProps[k1];
                clearTimeout(this.nextStateTimer);
                this.nextStateTimer = setTimeout(function() {
                    var requiresGridReset = false;
                    for(var k in _this.nextState){
                        _this.props[k] = _this.nextState[k];
                        if (k === "custom" || k === "categories") requiresGridReset = true;
                    }
                    delete _this.nextState;
                    var nextState = _this.getInitialState();
                    if (requiresGridReset) return _this.reset(nextState);
                    _this.setState(nextState);
                });
            }
        },
        {
            key: "componentWillUnmount",
            value: function componentWillUnmount() {
                this.unregister();
            }
        },
        {
            key: "reset",
            value: function reset() {
                var nextState = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
                var _this = this;
                return (0, (/*@__PURE__*/$parcel$interopDefault($f653aaea2ce76311$exports)))((0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).mark(function _callee() {
                    return (0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).wrap(function _callee$(_ctx) {
                        while(1)switch(_ctx.prev = _ctx.next){
                            case 0:
                                _ctx.next = 2;
                                return (0, $47b4a70d4572a3b3$export$2cd8252107eb640b)(_this.props);
                            case 2:
                                _this.initGrid();
                                _this.unobserve();
                                _this.setState(nextState, function() {
                                    _this.observeCategories();
                                    _this.observeRows();
                                });
                            case 5:
                            case "end":
                                return _ctx.stop();
                        }
                    }, _callee);
                }))();
            }
        },
        {
            key: "register",
            value: function register() {
                document.addEventListener("click", this.handleClickOutside);
                this.observe();
            }
        },
        {
            key: "unregister",
            value: function unregister() {
                var ref;
                document.removeEventListener("click", this.handleClickOutside);
                (ref = this.darkMedia) === null || ref === void 0 ? void 0 : ref.removeEventListener("change", this.darkMediaCallback);
                this.unobserve();
            }
        },
        {
            key: "observe",
            value: function observe() {
                this.observeCategories();
                this.observeRows();
            }
        },
        {
            key: "unobserve",
            value: function unobserve() {
                var ref = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {}, _except = ref.except, except = _except === void 0 ? [] : _except;
                if (!Array.isArray(except)) except = [
                    except
                ];
                var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                try {
                    for(var _iterator = this.observers[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                        var observer = _step.value;
                        if (except.includes(observer)) continue;
                        observer.disconnect();
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally{
                    try {
                        if (!_iteratorNormalCompletion && _iterator.return != null) {
                            _iterator.return();
                        }
                    } finally{
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }
                this.observers = [].concat(except);
            }
        },
        {
            key: "initGrid",
            value: function initGrid() {
                var _this = this;
                var categories = (0, $47b4a70d4572a3b3$export$2d0294657ab35f1b).categories;
                this.refs.categories = new Map();
                var navKey = (0, $47b4a70d4572a3b3$export$2d0294657ab35f1b).categories.map(function(category) {
                    return category.id;
                }).join(",");
                if (this.navKey && this.navKey != navKey) this.refs.scroll.current && (this.refs.scroll.current.scrollTop = 0);
                this.navKey = navKey;
                this.grid = [];
                this.grid.setsize = 0;
                var addRow = function(rows, category) {
                    var row = [];
                    row.__categoryId = category.id;
                    row.__index = rows.length;
                    _this.grid.push(row);
                    var rowIndex = _this.grid.length - 1;
                    var rowRef = rowIndex % $75afa6943437e26f$var$Performance.rowsPerRender ? {} : (0, $d5fc6ac583bc94a1$export$7d1e3a5e95ceca43)();
                    rowRef.index = rowIndex;
                    rowRef.posinset = _this.grid.setsize + 1;
                    rows.push(rowRef);
                    return row;
                };
                var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                try {
                    for(var _iterator = categories[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                        var category1 = _step.value;
                        var rows1 = [];
                        var row1 = addRow(rows1, category1);
                        var _iteratorNormalCompletion1 = true, _didIteratorError1 = false, _iteratorError1 = undefined;
                        try {
                            for(var _iterator1 = category1.emojis[Symbol.iterator](), _step1; !(_iteratorNormalCompletion1 = (_step1 = _iterator1.next()).done); _iteratorNormalCompletion1 = true){
                                var emoji = _step1.value;
                                if (row1.length == this.getPerLine()) row1 = addRow(rows1, category1);
                                this.grid.setsize += 1;
                                row1.push(emoji);
                            }
                        } catch (err) {
                            _didIteratorError1 = true;
                            _iteratorError1 = err;
                        } finally{
                            try {
                                if (!_iteratorNormalCompletion1 && _iterator1.return != null) {
                                    _iterator1.return();
                                }
                            } finally{
                                if (_didIteratorError1) {
                                    throw _iteratorError1;
                                }
                            }
                        }
                        this.refs.categories.set(category1.id, {
                            root: (0, $d5fc6ac583bc94a1$export$7d1e3a5e95ceca43)(),
                            rows: rows1
                        });
                    }
                } catch (err) {
                    _didIteratorError = true;
                    _iteratorError = err;
                } finally{
                    try {
                        if (!_iteratorNormalCompletion && _iterator.return != null) {
                            _iterator.return();
                        }
                    } finally{
                        if (_didIteratorError) {
                            throw _iteratorError;
                        }
                    }
                }
            }
        },
        {
            key: "initTheme",
            value: function initTheme(theme) {
                if (theme != "auto") return theme;
                if (!this.darkMedia) {
                    this.darkMedia = matchMedia("(prefers-color-scheme: dark)");
                    if (this.darkMedia.media.match(/^not/)) return "light";
                    this.darkMedia.addEventListener("change", this.darkMediaCallback);
                }
                return this.darkMedia.matches ? "dark" : "light";
            }
        },
        {
            key: "initDynamicPerLine",
            value: function initDynamicPerLine() {
                var props = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : this.props;
                var _this4 = this;
                if (!props.dynamicWidth) return;
                var element = props.element, emojiButtonSize = props.emojiButtonSize;
                var calculatePerLine = function() {
                    var width = element.getBoundingClientRect().width;
                    return Math.floor(width / emojiButtonSize);
                };
                var observer = new ResizeObserver(function() {
                    var _this3 = _this4;
                    _this4.unobserve({
                        except: observer
                    });
                    _this4.setState({
                        perLine: calculatePerLine()
                    }, function() {
                        var _this = _this3;
                        _this3.initGrid();
                        _this3.forceUpdate(function() {
                            _this.observeCategories();
                            _this.observeRows();
                        });
                    });
                });
                observer.observe(element);
                this.observers.push(observer);
                return calculatePerLine();
            }
        },
        {
            key: "getPerLine",
            value: function getPerLine() {
                return this.state.perLine || this.props.perLine;
            }
        },
        {
            key: "getEmojiByPos",
            value: function getEmojiByPos(param) {
                var _param = (0, (/*@__PURE__*/$parcel$interopDefault($f521ef7da5d46cb0$exports)))(param, 2), p1 = _param[0], p2 = _param[1];
                var grid = this.state.searchResults || this.grid;
                var emoji = grid[p1] && grid[p1][p2];
                if (!emoji) return;
                return (0, $022b4a7de802d8eb$export$2e2bcd8739ae039).get(emoji);
            }
        },
        {
            key: "observeCategories",
            value: function observeCategories() {
                var navigation = this.refs.navigation.current;
                if (!navigation) return;
                var visibleCategories = new Map();
                var setFocusedCategory = function(categoryId) {
                    if (categoryId != navigation.state.categoryId) navigation.setState({
                        categoryId: categoryId
                    });
                };
                var observerOptions = {
                    root: this.refs.scroll.current,
                    threshold: [
                        0.0,
                        1.0
                    ]
                };
                var observer = new IntersectionObserver(function(entries) {
                    var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    try {
                        for(var _iterator = entries[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                            var entry = _step.value;
                            var id = entry.target.dataset.id;
                            visibleCategories.set(id, entry.intersectionRatio);
                        }
                    } catch (err) {
                        _didIteratorError = true;
                        _iteratorError = err;
                    } finally{
                        try {
                            if (!_iteratorNormalCompletion && _iterator.return != null) {
                                _iterator.return();
                            }
                        } finally{
                            if (_didIteratorError) {
                                throw _iteratorError;
                            }
                        }
                    }
                    var ratios = (0, (/*@__PURE__*/$parcel$interopDefault($768065e6069a057e$exports)))(visibleCategories);
                    var _iteratorNormalCompletion2 = true, _didIteratorError2 = false, _iteratorError2 = undefined;
                    try {
                        for(var _iterator2 = ratios[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true){
                            var _value = (0, (/*@__PURE__*/$parcel$interopDefault($f521ef7da5d46cb0$exports)))(_step2.value, 2), id1 = _value[0], ratio = _value[1];
                            if (ratio) {
                                setFocusedCategory(id1);
                                break;
                            }
                        }
                    } catch (err1) {
                        _didIteratorError2 = true;
                        _iteratorError2 = err1;
                    } finally{
                        try {
                            if (!_iteratorNormalCompletion2 && _iterator2.return != null) {
                                _iterator2.return();
                            }
                        } finally{
                            if (_didIteratorError2) {
                                throw _iteratorError2;
                            }
                        }
                    }
                }, observerOptions);
                var _iteratorNormalCompletion3 = true, _didIteratorError3 = false, _iteratorError3 = undefined;
                try {
                    for(var _iterator3 = this.refs.categories.values()[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true){
                        var root = _step3.value.root;
                        observer.observe(root.current);
                    }
                } catch (err) {
                    _didIteratorError3 = true;
                    _iteratorError3 = err;
                } finally{
                    try {
                        if (!_iteratorNormalCompletion3 && _iterator3.return != null) {
                            _iterator3.return();
                        }
                    } finally{
                        if (_didIteratorError3) {
                            throw _iteratorError3;
                        }
                    }
                }
                this.observers.push(observer);
            }
        },
        {
            key: "observeRows",
            value: function observeRows() {
                var _this = this;
                var visibleRows = (0, (/*@__PURE__*/$parcel$interopDefault($06c6b18a6115d5f3$exports)))({}, this.state.visibleRows);
                var observer = new IntersectionObserver(function(entries) {
                    var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    try {
                        for(var _iterator = entries[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                            var entry = _step.value;
                            var index = parseInt(entry.target.dataset.index);
                            if (entry.isIntersecting) visibleRows[index] = true;
                            else delete visibleRows[index];
                        }
                    } catch (err) {
                        _didIteratorError = true;
                        _iteratorError = err;
                    } finally{
                        try {
                            if (!_iteratorNormalCompletion && _iterator.return != null) {
                                _iterator.return();
                            }
                        } finally{
                            if (_didIteratorError) {
                                throw _iteratorError;
                            }
                        }
                    }
                    _this.setState({
                        visibleRows: visibleRows
                    });
                }, {
                    root: this.refs.scroll.current,
                    rootMargin: "".concat(this.props.emojiButtonSize * ($75afa6943437e26f$var$Performance.rowsPerRender + 5), "px 0px ").concat(this.props.emojiButtonSize * $75afa6943437e26f$var$Performance.rowsPerRender, "px")
                });
                var _iteratorNormalCompletion5 = true, _didIteratorError5 = false, _iteratorError5 = undefined;
                try {
                    for(var _iterator5 = this.refs.categories.values()[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true){
                        var rows = _step5.value.rows;
                        var _iteratorNormalCompletion4 = true, _didIteratorError4 = false, _iteratorError4 = undefined;
                        try {
                            for(var _iterator4 = rows[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true){
                                var row = _step4.value;
                                if (row.current) observer.observe(row.current);
                            }
                        } catch (err) {
                            _didIteratorError4 = true;
                            _iteratorError4 = err;
                        } finally{
                            try {
                                if (!_iteratorNormalCompletion4 && _iterator4.return != null) {
                                    _iterator4.return();
                                }
                            } finally{
                                if (_didIteratorError4) {
                                    throw _iteratorError4;
                                }
                            }
                        }
                    }
                } catch (err) {
                    _didIteratorError5 = true;
                    _iteratorError5 = err;
                } finally{
                    try {
                        if (!_iteratorNormalCompletion5 && _iterator5.return != null) {
                            _iterator5.return();
                        }
                    } finally{
                        if (_didIteratorError5) {
                            throw _iteratorError5;
                        }
                    }
                }
                this.observers.push(observer);
            }
        },
        {
            key: "preventDefault",
            value: function preventDefault(e) {
                e.preventDefault();
            }
        },
        {
            key: "unfocusSearch",
            value: function unfocusSearch() {
                var input = this.refs.searchInput.current;
                if (!input) return;
                input.blur();
            }
        },
        {
            key: "navigate",
            value: function navigate(param) {
                var e = param.e, input = param.input, left = param.left, right = param.right, up = param.up, down = param.down;
                var _this = this;
                var grid = this.state.searchResults || this.grid;
                if (!grid.length) return;
                var _pos = (0, (/*@__PURE__*/$parcel$interopDefault($f521ef7da5d46cb0$exports)))(this.state.pos, 2), p1 = _pos[0], p2 = _pos[1];
                var pos = function() {
                    if (p1 == 0) {
                        if (p2 == 0 && !e.repeat && (left || up)) return null;
                    }
                    if (p1 == -1) {
                        if (!e.repeat && (right || down) && input.selectionStart == input.value.length) return [
                            0,
                            0
                        ];
                        return null;
                    }
                    if (left || right) {
                        var row = grid[p1];
                        var increment = left ? -1 : 1;
                        p2 += increment;
                        if (!row[p2]) {
                            p1 += increment;
                            row = grid[p1];
                            if (!row) {
                                p1 = left ? 0 : grid.length - 1;
                                p2 = left ? 0 : grid[p1].length - 1;
                                return [
                                    p1,
                                    p2
                                ];
                            }
                            p2 = left ? row.length - 1 : 0;
                        }
                        return [
                            p1,
                            p2
                        ];
                    }
                    if (up || down) {
                        p1 += up ? -1 : 1;
                        var row2 = grid[p1];
                        if (!row2) {
                            p1 = up ? 0 : grid.length - 1;
                            p2 = up ? 0 : grid[p1].length - 1;
                            return [
                                p1,
                                p2
                            ];
                        }
                        if (!row2[p2]) p2 = row2.length - 1;
                        return [
                            p1,
                            p2
                        ];
                    }
                }();
                if (pos) e.preventDefault();
                else {
                    if (this.state.pos[0] > -1) this.setState({
                        pos: [
                            -1,
                            -1
                        ]
                    });
                    return;
                }
                this.setState({
                    pos: pos,
                    keyboard: true
                }, function() {
                    _this.scrollTo({
                        row: pos[0]
                    });
                });
            }
        },
        {
            key: "scrollTo",
            value: function scrollTo(param) {
                var categoryId = param.categoryId, row = param.row;
                var grid = this.state.searchResults || this.grid;
                if (!grid.length) return;
                var scroll = this.refs.scroll.current;
                var scrollRect = scroll.getBoundingClientRect();
                var scrollTop = 0;
                if (row >= 0) categoryId = grid[row].__categoryId;
                if (categoryId) {
                    var ref = this.refs[categoryId] || this.refs.categories.get(categoryId).root;
                    var categoryRect = ref.current.getBoundingClientRect();
                    scrollTop = categoryRect.top - (scrollRect.top - scroll.scrollTop) + 1;
                }
                if (row >= 0) {
                    if (!row) scrollTop = 0;
                    else {
                        var rowIndex = grid[row].__index;
                        var rowTop = scrollTop + rowIndex * this.props.emojiButtonSize;
                        var rowBot = rowTop + this.props.emojiButtonSize + this.props.emojiButtonSize * 0.88;
                        if (rowTop < scroll.scrollTop) scrollTop = rowTop;
                        else if (rowBot > scroll.scrollTop + scrollRect.height) scrollTop = rowBot - scrollRect.height;
                        else return;
                    }
                }
                this.ignoreMouse();
                scroll.scrollTop = scrollTop;
            }
        },
        {
            key: "ignoreMouse",
            value: function ignoreMouse() {
                var _this = this;
                this.mouseIsIgnored = true;
                clearTimeout(this.ignoreMouseTimer);
                this.ignoreMouseTimer = setTimeout(function() {
                    delete _this.mouseIsIgnored;
                }, 100);
            }
        },
        {
            key: "handleEmojiOver",
            value: function handleEmojiOver(pos) {
                if (this.mouseIsIgnored || this.state.showSkins) return;
                this.setState({
                    pos: pos || [
                        -1,
                        -1
                    ],
                    keyboard: false
                });
            }
        },
        {
            key: "handleEmojiClick",
            value: function handleEmojiClick(param) {
                var e = param.e, emoji = param.emoji, pos = param.pos;
                if (!this.props.onEmojiSelect) return;
                if (!emoji && pos) emoji = this.getEmojiByPos(pos);
                if (emoji) {
                    var emojiData = (0, $0542300b6c56b62c$export$d10ac59fbe52a745)(emoji, {
                        skinIndex: this.state.skin - 1
                    });
                    if (this.props.maxFrequentRows) (0, $79925e24c549250c$export$2e2bcd8739ae039).add(emojiData, this.props);
                    this.props.onEmojiSelect(emojiData, e);
                }
            }
        },
        {
            key: "closeSkins",
            value: function closeSkins() {
                if (!this.state.showSkins) return;
                this.setState({
                    showSkins: null,
                    tempSkin: null
                });
                this.base.removeEventListener("click", this.handleBaseClick);
                this.base.removeEventListener("keydown", this.handleBaseKeydown);
            }
        },
        {
            key: "handleSkinMouseOver",
            value: function handleSkinMouseOver(tempSkin) {
                this.setState({
                    tempSkin: tempSkin
                });
            }
        },
        {
            key: "handleSkinClick",
            value: function handleSkinClick(skin) {
                this.ignoreMouse();
                this.closeSkins();
                this.setState({
                    skin: skin,
                    tempSkin: null
                });
                (0, $000e3cabb83607f9$export$2e2bcd8739ae039).set("skin", skin);
            }
        },
        {
            key: "renderNav",
            value: function renderNav() {
                return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)((0, $48caf7705e9bdcb5$export$2e2bcd8739ae039), {
                    ref: this.refs.navigation,
                    icons: this.props.icons,
                    theme: this.state.theme,
                    dir: this.dir,
                    unfocused: !!this.state.searchResults,
                    position: this.props.navPosition,
                    onClick: this.handleCategoryClick
                }, this.navKey);
            }
        },
        {
            key: "renderPreview",
            value: function renderPreview() {
                var emoji = this.getEmojiByPos(this.state.pos);
                var noSearchResults = this.state.searchResults && !this.state.searchResults.length;
                return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                    id: "preview",
                    class: "flex flex-middle",
                    dir: this.dir,
                    "data-position": this.props.previewPosition,
                    children: [
                        /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                            class: "flex flex-middle flex-grow",
                            children: [
                                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                    class: "flex flex-auto flex-middle flex-center",
                                    style: {
                                        height: this.props.emojiButtonSize,
                                        fontSize: this.props.emojiButtonSize
                                    },
                                    children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)((0, $4229cb2d7488f9c8$export$2e2bcd8739ae039), {
                                        emoji: emoji,
                                        id: noSearchResults ? this.props.noResultsEmoji || "cry" : this.props.previewEmoji || (this.props.previewPosition == "top" ? "point_down" : "point_up"),
                                        set: this.props.set,
                                        size: this.props.emojiButtonSize,
                                        skin: this.state.tempSkin || this.state.skin,
                                        spritesheet: true,
                                        getSpritesheetURL: this.props.getSpritesheetURL
                                    })
                                }),
                                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                    class: "margin-".concat(this.dir[0]),
                                    children: emoji || noSearchResults ? /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                        class: "padding-".concat(this.dir[2], " align-").concat(this.dir[0]),
                                        children: [
                                            /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                                class: "preview-title ellipsis",
                                                children: emoji ? emoji.name : (0, $47b4a70d4572a3b3$export$dbe3113d60765c1a).search_no_results_1
                                            }),
                                            /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                                class: "preview-subtitle ellipsis color-c",
                                                children: emoji ? emoji.skins[0].shortcodes : (0, $47b4a70d4572a3b3$export$dbe3113d60765c1a).search_no_results_2
                                            })
                                        ]
                                    }) : /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                        class: "preview-placeholder color-c",
                                        children: (0, $47b4a70d4572a3b3$export$dbe3113d60765c1a).pick
                                    })
                                })
                            ]
                        }),
                        !emoji && this.props.skinTonePosition == "preview" && this.renderSkinToneButton()
                    ]
                });
            }
        },
        {
            key: "renderEmojiButton",
            value: function renderEmojiButton(emoji, param) {
                var pos = param.pos, posinset = param.posinset, grid = param.grid;
                var _this = this;
                var size = this.props.emojiButtonSize;
                var skin = this.state.tempSkin || this.state.skin;
                var emojiSkin = emoji.skins[skin - 1] || emoji.skins[0];
                var native = emojiSkin.native;
                var selected = (0, $0542300b6c56b62c$export$9cb4719e2e525b7a)(this.state.pos, pos);
                var key = pos.concat(emoji.id).join("");
                return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)((0, $caeffba843b1695e$export$2e2bcd8739ae039), {
                    selected: selected,
                    skin: skin,
                    size: size,
                    children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("button", {
                        "aria-label": native,
                        "aria-selected": selected || undefined,
                        "aria-posinset": posinset,
                        "aria-setsize": grid.setsize,
                        "data-keyboard": this.state.keyboard,
                        title: this.props.previewPosition == "none" ? emoji.name : undefined,
                        type: "button",
                        class: "flex flex-center flex-middle",
                        tabindex: "-1",
                        onClick: function(e) {
                            return _this.handleEmojiClick({
                                e: e,
                                emoji: emoji
                            });
                        },
                        onMouseEnter: function() {
                            return _this.handleEmojiOver(pos);
                        },
                        onMouseLeave: function() {
                            return _this.handleEmojiOver();
                        },
                        style: {
                            width: this.props.emojiButtonSize,
                            height: this.props.emojiButtonSize,
                            fontSize: this.props.emojiSize,
                            lineHeight: 0
                        },
                        children: [
                            /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                "aria-hidden": "true",
                                class: "background",
                                style: {
                                    borderRadius: this.props.emojiButtonRadius,
                                    backgroundColor: this.props.emojiButtonColors ? this.props.emojiButtonColors[(posinset - 1) % this.props.emojiButtonColors.length] : undefined
                                }
                            }),
                            /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)((0, $4229cb2d7488f9c8$export$2e2bcd8739ae039), {
                                emoji: emoji,
                                set: this.props.set,
                                size: this.props.emojiSize,
                                skin: skin,
                                spritesheet: true,
                                getSpritesheetURL: this.props.getSpritesheetURL
                            })
                        ]
                    })
                }, key);
            }
        },
        {
            key: "renderSearch",
            value: function renderSearch() {
                var renderSkinTone = this.props.previewPosition == "none" || this.props.skinTonePosition == "search";
                return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                    children: [
                        /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                            class: "spacer"
                        }),
                        /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                            class: "flex flex-middle",
                            children: [
                                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                    class: "search relative flex-grow",
                                    children: [
                                        /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("input", {
                                            type: "search",
                                            ref: this.refs.searchInput,
                                            placeholder: (0, $47b4a70d4572a3b3$export$dbe3113d60765c1a).search,
                                            onClick: this.handleSearchClick,
                                            onInput: this.handleSearchInput,
                                            onKeyDown: this.handleSearchKeyDown,
                                            autoComplete: "off"
                                        }),
                                        /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("span", {
                                            class: "icon loupe flex",
                                            children: (0, $b9ae2abd9272dd52$export$2e2bcd8739ae039).search.loupe
                                        }),
                                        this.state.searchResults && /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("button", {
                                            title: "Clear",
                                            "aria-label": "Clear",
                                            type: "button",
                                            class: "icon delete flex",
                                            onClick: this.clearSearch,
                                            onMouseDown: this.preventDefault,
                                            children: (0, $b9ae2abd9272dd52$export$2e2bcd8739ae039).search.delete
                                        })
                                    ]
                                }),
                                renderSkinTone && this.renderSkinToneButton()
                            ]
                        })
                    ]
                });
            }
        },
        {
            key: "renderSearchResults",
            value: function renderSearchResults() {
                var _this = this;
                var searchResults = this.state.searchResults;
                if (!searchResults) return null;
                return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                    class: "category",
                    ref: this.refs.search,
                    children: [
                        /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                            class: "sticky padding-small align-".concat(this.dir[0]),
                            children: (0, $47b4a70d4572a3b3$export$dbe3113d60765c1a).categories.search
                        }),
                        /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                            children: !searchResults.length ? /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                class: "padding-small align-".concat(this.dir[0]),
                                children: this.props.onAddCustomEmoji && /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("a", {
                                    onClick: this.props.onAddCustomEmoji,
                                    children: (0, $47b4a70d4572a3b3$export$dbe3113d60765c1a).add_custom
                                })
                            }) : searchResults.map(function(row, i) {
                                var _this5 = _this;
                                return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                    class: "flex",
                                    children: row.map(function(emoji, ii) {
                                        return _this5.renderEmojiButton(emoji, {
                                            pos: [
                                                i,
                                                ii
                                            ],
                                            posinset: i * _this5.props.perLine + ii + 1,
                                            grid: searchResults
                                        });
                                    })
                                });
                            })
                        })
                    ]
                });
            }
        },
        {
            key: "renderCategories",
            value: function renderCategories() {
                var _this7 = this;
                var categories = (0, $47b4a70d4572a3b3$export$2d0294657ab35f1b).categories;
                var hidden = !!this.state.searchResults;
                var perLine = this.getPerLine();
                return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                    style: {
                        visibility: hidden ? "hidden" : undefined,
                        display: hidden ? "none" : undefined,
                        height: "100%"
                    },
                    children: categories.map(function(category) {
                        var _this6 = _this7;
                        var ref1 = _this7.refs.categories.get(category.id), root = ref1.root, rows = ref1.rows;
                        return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                            "data-id": category.target ? category.target.id : category.id,
                            class: "category",
                            ref: root,
                            children: [
                                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                    class: "sticky padding-small align-".concat(_this7.dir[0]),
                                    children: category.name || (0, $47b4a70d4572a3b3$export$dbe3113d60765c1a).categories[category.id]
                                }),
                                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                    class: "relative",
                                    style: {
                                        height: rows.length * _this7.props.emojiButtonSize
                                    },
                                    children: rows.map(function(row, i) {
                                        var _this = _this6;
                                        var _emojiIds;
                                        var targetRow = row.index - row.index % $75afa6943437e26f$var$Performance.rowsPerRender;
                                        var visible = _this6.state.visibleRows[targetRow];
                                        var ref = "current" in row ? row : undefined;
                                        if (!visible && !ref) return null;
                                        var start = i * perLine;
                                        var end = start + perLine;
                                        var emojiIds = category.emojis.slice(start, end);
                                        if (emojiIds.length < perLine) (_emojiIds = emojiIds).push.apply(_emojiIds, (0, (/*@__PURE__*/$parcel$interopDefault($768065e6069a057e$exports)))(new Array(perLine - emojiIds.length)));
                                        return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                            "data-index": row.index,
                                            ref: ref,
                                            class: "flex row",
                                            style: {
                                                top: i * _this6.props.emojiButtonSize
                                            },
                                            children: visible && emojiIds.map(function(emojiId, ii) {
                                                if (!emojiId) return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                                    style: {
                                                        width: _this.props.emojiButtonSize,
                                                        height: _this.props.emojiButtonSize
                                                    }
                                                });
                                                var emoji = (0, $022b4a7de802d8eb$export$2e2bcd8739ae039).get(emojiId);
                                                return _this.renderEmojiButton(emoji, {
                                                    pos: [
                                                        row.index,
                                                        ii
                                                    ],
                                                    posinset: row.posinset + ii,
                                                    grid: _this.grid
                                                });
                                            })
                                        }, row.index);
                                    })
                                })
                            ]
                        });
                    })
                });
            }
        },
        {
            key: "renderSkinToneButton",
            value: function renderSkinToneButton() {
                if (this.props.skinTonePosition == "none") return null;
                return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                    class: "flex flex-auto flex-center flex-middle",
                    style: {
                        position: "relative",
                        width: this.props.emojiButtonSize,
                        height: this.props.emojiButtonSize
                    },
                    children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("button", {
                        type: "button",
                        ref: this.refs.skinToneButton,
                        class: "skin-tone-button flex flex-auto flex-center flex-middle",
                        "aria-selected": this.state.showSkins ? "" : undefined,
                        "aria-label": (0, $47b4a70d4572a3b3$export$dbe3113d60765c1a).skins.choose,
                        title: (0, $47b4a70d4572a3b3$export$dbe3113d60765c1a).skins.choose,
                        onClick: this.openSkins,
                        style: {
                            width: this.props.emojiSize,
                            height: this.props.emojiSize
                        },
                        children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("span", {
                            class: "skin-tone skin-tone-".concat(this.state.skin)
                        })
                    })
                });
            }
        },
        {
            key: "renderLiveRegion",
            value: function renderLiveRegion() {
                var emoji = this.getEmojiByPos(this.state.pos);
                var contents = emoji ? emoji.name : "";
                return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                    "aria-live": "polite",
                    class: "sr-only",
                    children: contents
                });
            }
        },
        {
            key: "renderSkins",
            value: function renderSkins() {
                var _this = this;
                var skinToneButton = this.refs.skinToneButton.current;
                var skinToneButtonRect = skinToneButton.getBoundingClientRect();
                var baseRect = this.base.getBoundingClientRect();
                var position = {};
                if (this.dir == "ltr") position.right = baseRect.right - skinToneButtonRect.right - 3;
                else position.left = skinToneButtonRect.left - baseRect.left - 3;
                if (this.props.previewPosition == "bottom" && this.props.skinTonePosition == "preview") position.bottom = baseRect.bottom - skinToneButtonRect.top + 6;
                else {
                    position.top = skinToneButtonRect.bottom - baseRect.top + 3;
                    position.bottom = "auto";
                }
                return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                    ref: this.refs.menu,
                    role: "radiogroup",
                    dir: this.dir,
                    "aria-label": (0, $47b4a70d4572a3b3$export$dbe3113d60765c1a).skins.choose,
                    class: "menu hidden",
                    "data-position": position.top ? "top" : "bottom",
                    style: position,
                    children: (0, (/*@__PURE__*/$parcel$interopDefault($768065e6069a057e$exports)))(Array(6).keys()).map(function(i) {
                        var _this8 = _this;
                        var skin = i + 1;
                        var checked = _this.state.skin == skin;
                        return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                            children: [
                                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("input", {
                                    type: "radio",
                                    name: "skin-tone",
                                    value: skin,
                                    "aria-label": (0, $47b4a70d4572a3b3$export$dbe3113d60765c1a).skins[skin],
                                    ref: checked ? _this.refs.skinToneRadio : null,
                                    defaultChecked: checked,
                                    onChange: function() {
                                        return _this8.handleSkinMouseOver(skin);
                                    },
                                    onKeyDown: function(e) {
                                        if (e.code == "Enter" || e.code == "Space" || e.code == "Tab") {
                                            e.preventDefault();
                                            _this8.handleSkinClick(skin);
                                        }
                                    }
                                }),
                                /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("button", {
                                    "aria-hidden": "true",
                                    tabindex: "-1",
                                    onClick: function() {
                                        return _this8.handleSkinClick(skin);
                                    },
                                    onMouseEnter: function() {
                                        return _this8.handleSkinMouseOver(skin);
                                    },
                                    onMouseLeave: function() {
                                        return _this8.handleSkinMouseOver();
                                    },
                                    class: "option flex flex-grow flex-middle",
                                    children: [
                                        /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("span", {
                                            class: "skin-tone skin-tone-".concat(skin)
                                        }),
                                        /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("span", {
                                            class: "margin-small-lr",
                                            children: (0, $47b4a70d4572a3b3$export$dbe3113d60765c1a).skins[skin]
                                        })
                                    ]
                                })
                            ]
                        });
                    })
                });
            }
        },
        {
            key: "render",
            value: function render() {
                var lineWidth = this.props.perLine * this.props.emojiButtonSize;
                return /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("section", {
                    id: "root",
                    class: "flex flex-column",
                    dir: this.dir,
                    style: {
                        width: this.props.dynamicWidth ? "100%" : "calc(".concat(lineWidth, "px + (var(--padding) + var(--sidebar-width)))")
                    },
                    "data-emoji-set": this.props.set,
                    "data-theme": this.state.theme,
                    "data-menu": this.state.showSkins ? "" : undefined,
                    children: [
                        this.props.previewPosition == "top" && this.renderPreview(),
                        this.props.navPosition == "top" && this.renderNav(),
                        this.props.searchPosition == "sticky" && /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                            class: "padding-lr",
                            children: this.renderSearch()
                        }),
                        /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                            ref: this.refs.scroll,
                            class: "scroll flex-grow padding-lr",
                            children: /*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)("div", {
                                style: {
                                    width: this.props.dynamicWidth ? "100%" : lineWidth,
                                    height: "100%"
                                },
                                children: [
                                    this.props.searchPosition == "static" && this.renderSearch(),
                                    this.renderSearchResults(),
                                    this.renderCategories()
                                ]
                            })
                        }),
                        this.props.navPosition == "bottom" && this.renderNav(),
                        this.props.previewPosition == "bottom" && this.renderPreview(),
                        this.state.showSkins && this.renderSkins(),
                        this.renderLiveRegion()
                    ]
                });
            }
        }
    ]);
    return Picker;
}((0, $d5fc6ac583bc94a1$export$16fa2f45be04daa8));






var $gntqc = parcelRequire("gntqc");










var $31da1154e788841c$export$2e2bcd8739ae039 = /*#__PURE__*/ function(ShadowElement1) {
    "use strict";
    (0, (/*@__PURE__*/$parcel$interopDefault($668009e4f1a1d720$exports)))(PickerElement, ShadowElement1);
    var _super = (0, (/*@__PURE__*/$parcel$interopDefault($a72404fd66b37813$exports)))(PickerElement);
    function PickerElement(props) {
        (0, (/*@__PURE__*/$parcel$interopDefault($aceb8ee155713853$exports)))(this, PickerElement);
        return _super.call(this, props, {
            styles: (0, (/*@__PURE__*/$parcel$interopDefault($fd6ebd5f6dea1d3a$exports)))
        });
    }
    (0, (/*@__PURE__*/$parcel$interopDefault($bf5a3d69977e47ef$exports)))(PickerElement, [
        {
            key: "connectedCallback",
            value: function connectedCallback() {
                var _this = this;
                return (0, (/*@__PURE__*/$parcel$interopDefault($f653aaea2ce76311$exports)))((0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).mark(function _callee() {
                    var props;
                    return (0, (/*@__PURE__*/$parcel$interopDefault($f5fc4923ef4118c4$exports))).wrap(function _callee$(_ctx) {
                        while(1)switch(_ctx.prev = _ctx.next){
                            case 0:
                                props = (0, $47b4a70d4572a3b3$export$75fe5f91d452f94b)(_this.props, (0, $f39d0d696aba82c3$export$2e2bcd8739ae039), _this);
                                props.element = _this;
                                props.ref = function(component) {
                                    _this.component = component;
                                };
                                _ctx.next = 5;
                                return (0, $47b4a70d4572a3b3$export$2cd8252107eb640b)(props);
                            case 5:
                                if (!_this.disconnected) {
                                    _ctx.next = 7;
                                    break;
                                }
                                return _ctx.abrupt("return");
                            case 7:
                                (0, $d5fc6ac583bc94a1$export$b3890eb0ae9dca99)(/*#__PURE__*/ (0, $55ec52987511209e$export$34b9dba7ce09269b)((0, $75afa6943437e26f$export$2e2bcd8739ae039), (0, (/*@__PURE__*/$parcel$interopDefault($06c6b18a6115d5f3$exports)))({}, props)), _this.shadowRoot);
                            case 8:
                            case "end":
                                return _ctx.stop();
                        }
                    }, _callee);
                }))();
            }
        }
    ]);
    return PickerElement;
}((0, $e3d2d32fa7bd8892$export$2e2bcd8739ae039));
(0, (/*@__PURE__*/$parcel$interopDefault($gntqc)))($31da1154e788841c$export$2e2bcd8739ae039, "Props", (0, $f39d0d696aba82c3$export$2e2bcd8739ae039));
if (typeof customElements !== "undefined" && !customElements.get("em-emoji-picker")) customElements.define("em-emoji-picker", $31da1154e788841c$export$2e2bcd8739ae039);


var $fd6ebd5f6dea1d3a$exports = {};
$fd6ebd5f6dea1d3a$exports = ":host {\n  width: min-content;\n  height: 435px;\n  min-height: 230px;\n  border-radius: var(--border-radius);\n  box-shadow: var(--shadow);\n  --border-radius: 10px;\n  --category-icon-size: 18px;\n  --font-family: -apple-system, BlinkMacSystemFont, \"Helvetica Neue\", sans-serif;\n  --font-size: 15px;\n  --preview-placeholder-size: 21px;\n  --preview-title-size: 1.1em;\n  --preview-subtitle-size: .9em;\n  --shadow-color: 0deg 0% 0%;\n  --shadow: .3px .5px 2.7px hsl(var(--shadow-color) / .14), .4px .8px 1px -3.2px hsl(var(--shadow-color) / .14), 1px 2px 2.5px -4.5px hsl(var(--shadow-color) / .14);\n  display: flex;\n}\n\n[data-theme=\"light\"] {\n  --em-rgb-color: var(--rgb-color, 34, 36, 39);\n  --em-rgb-accent: var(--rgb-accent, 34, 102, 237);\n  --em-rgb-background: var(--rgb-background, 255, 255, 255);\n  --em-rgb-input: var(--rgb-input, 255, 255, 255);\n  --em-color-border: var(--color-border, rgba(0, 0, 0, .05));\n  --em-color-border-over: var(--color-border-over, rgba(0, 0, 0, .1));\n}\n\n[data-theme=\"dark\"] {\n  --em-rgb-color: var(--rgb-color, 222, 222, 221);\n  --em-rgb-accent: var(--rgb-accent, 58, 130, 247);\n  --em-rgb-background: var(--rgb-background, 21, 22, 23);\n  --em-rgb-input: var(--rgb-input, 0, 0, 0);\n  --em-color-border: var(--color-border, rgba(255, 255, 255, .1));\n  --em-color-border-over: var(--color-border-over, rgba(255, 255, 255, .2));\n}\n\n#root {\n  --color-a: rgb(var(--em-rgb-color));\n  --color-b: rgba(var(--em-rgb-color), .65);\n  --color-c: rgba(var(--em-rgb-color), .45);\n  --padding: 12px;\n  --padding-small: calc(var(--padding) / 2);\n  --sidebar-width: 16px;\n  --duration: 225ms;\n  --duration-fast: 125ms;\n  --duration-instant: 50ms;\n  --easing: cubic-bezier(.4, 0, .2, 1);\n  width: 100%;\n  text-align: left;\n  border-radius: var(--border-radius);\n  background-color: rgb(var(--em-rgb-background));\n  position: relative;\n}\n\n@media (prefers-reduced-motion) {\n  #root {\n    --duration: 0;\n    --duration-fast: 0;\n    --duration-instant: 0;\n  }\n}\n\n#root[data-menu] button {\n  cursor: auto;\n}\n\n#root[data-menu] .menu button {\n  cursor: pointer;\n}\n\n:host, #root, input, button {\n  color: rgb(var(--em-rgb-color));\n  font-family: var(--font-family);\n  font-size: var(--font-size);\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  line-height: normal;\n}\n\n*, :before, :after {\n  box-sizing: border-box;\n  min-width: 0;\n  margin: 0;\n  padding: 0;\n}\n\n.relative {\n  position: relative;\n}\n\n.flex {\n  display: flex;\n}\n\n.flex-auto {\n  flex: none;\n}\n\n.flex-center {\n  justify-content: center;\n}\n\n.flex-column {\n  flex-direction: column;\n}\n\n.flex-grow {\n  flex: auto;\n}\n\n.flex-middle {\n  align-items: center;\n}\n\n.flex-wrap {\n  flex-wrap: wrap;\n}\n\n.padding {\n  padding: var(--padding);\n}\n\n.padding-t {\n  padding-top: var(--padding);\n}\n\n.padding-lr {\n  padding-left: var(--padding);\n  padding-right: var(--padding);\n}\n\n.padding-r {\n  padding-right: var(--padding);\n}\n\n.padding-small {\n  padding: var(--padding-small);\n}\n\n.padding-small-b {\n  padding-bottom: var(--padding-small);\n}\n\n.padding-small-lr {\n  padding-left: var(--padding-small);\n  padding-right: var(--padding-small);\n}\n\n.margin {\n  margin: var(--padding);\n}\n\n.margin-r {\n  margin-right: var(--padding);\n}\n\n.margin-l {\n  margin-left: var(--padding);\n}\n\n.margin-small-l {\n  margin-left: var(--padding-small);\n}\n\n.margin-small-lr {\n  margin-left: var(--padding-small);\n  margin-right: var(--padding-small);\n}\n\n.align-l {\n  text-align: left;\n}\n\n.align-r {\n  text-align: right;\n}\n\n.color-a {\n  color: var(--color-a);\n}\n\n.color-b {\n  color: var(--color-b);\n}\n\n.color-c {\n  color: var(--color-c);\n}\n\n.ellipsis {\n  white-space: nowrap;\n  max-width: 100%;\n  width: auto;\n  text-overflow: ellipsis;\n  overflow: hidden;\n}\n\n.sr-only {\n  width: 1px;\n  height: 1px;\n  position: absolute;\n  top: auto;\n  left: -10000px;\n  overflow: hidden;\n}\n\na {\n  cursor: pointer;\n  color: rgb(var(--em-rgb-accent));\n}\n\na:hover {\n  text-decoration: underline;\n}\n\n.spacer {\n  height: 10px;\n}\n\n[dir=\"rtl\"] .scroll {\n  padding-left: 0;\n  padding-right: var(--padding);\n}\n\n.scroll {\n  padding-right: 0;\n  overflow-x: hidden;\n  overflow-y: auto;\n}\n\n.scroll::-webkit-scrollbar {\n  width: var(--sidebar-width);\n  height: var(--sidebar-width);\n}\n\n.scroll::-webkit-scrollbar-track {\n  border: 0;\n}\n\n.scroll::-webkit-scrollbar-button {\n  width: 0;\n  height: 0;\n  display: none;\n}\n\n.scroll::-webkit-scrollbar-corner {\n  background-color: rgba(0, 0, 0, 0);\n}\n\n.scroll::-webkit-scrollbar-thumb {\n  min-height: 20%;\n  min-height: 65px;\n  border: 4px solid rgb(var(--em-rgb-background));\n  border-radius: 8px;\n}\n\n.scroll::-webkit-scrollbar-thumb:hover {\n  background-color: var(--em-color-border-over) !important;\n}\n\n.scroll:hover::-webkit-scrollbar-thumb {\n  background-color: var(--em-color-border);\n}\n\n.sticky {\n  z-index: 1;\n  background-color: rgba(var(--em-rgb-background), .9);\n  -webkit-backdrop-filter: blur(4px);\n  backdrop-filter: blur(4px);\n  font-weight: 500;\n  position: sticky;\n  top: -1px;\n}\n\n[dir=\"rtl\"] .search input[type=\"search\"] {\n  padding: 10px 2.2em 10px 2em;\n}\n\n[dir=\"rtl\"] .search .loupe {\n  left: auto;\n  right: .7em;\n}\n\n[dir=\"rtl\"] .search .delete {\n  left: .7em;\n  right: auto;\n}\n\n.search {\n  z-index: 2;\n  position: relative;\n}\n\n.search input, .search button {\n  font-size: calc(var(--font-size)  - 1px);\n}\n\n.search input[type=\"search\"] {\n  width: 100%;\n  background-color: var(--em-color-border);\n  transition-duration: var(--duration);\n  transition-property: background-color, box-shadow;\n  transition-timing-function: var(--easing);\n  border: 0;\n  border-radius: 10px;\n  outline: 0;\n  padding: 10px 2em 10px 2.2em;\n  display: block;\n}\n\n.search input[type=\"search\"]::-ms-input-placeholder {\n  color: inherit;\n  opacity: .6;\n}\n\n.search input[type=\"search\"]::placeholder {\n  color: inherit;\n  opacity: .6;\n}\n\n.search input[type=\"search\"], .search input[type=\"search\"]::-webkit-search-decoration, .search input[type=\"search\"]::-webkit-search-cancel-button, .search input[type=\"search\"]::-webkit-search-results-button, .search input[type=\"search\"]::-webkit-search-results-decoration {\n  -webkit-appearance: none;\n  -ms-appearance: none;\n  appearance: none;\n}\n\n.search input[type=\"search\"]:focus {\n  background-color: rgb(var(--em-rgb-input));\n  box-shadow: inset 0 0 0 1px rgb(var(--em-rgb-accent)), 0 1px 3px rgba(65, 69, 73, .2);\n}\n\n.search .icon {\n  z-index: 1;\n  color: rgba(var(--em-rgb-color), .7);\n  position: absolute;\n  top: 50%;\n  transform: translateY(-50%);\n}\n\n.search .loupe {\n  pointer-events: none;\n  left: .7em;\n}\n\n.search .delete {\n  right: .7em;\n}\n\nsvg {\n  fill: currentColor;\n  width: 1em;\n  height: 1em;\n}\n\nbutton {\n  -webkit-appearance: none;\n  -ms-appearance: none;\n  appearance: none;\n  cursor: pointer;\n  color: currentColor;\n  background-color: rgba(0, 0, 0, 0);\n  border: 0;\n}\n\n#nav {\n  z-index: 2;\n  padding-top: 12px;\n  padding-bottom: 12px;\n  padding-right: var(--sidebar-width);\n  position: relative;\n}\n\n#nav button {\n  color: var(--color-b);\n  transition: color var(--duration) var(--easing);\n}\n\n#nav button:hover {\n  color: var(--color-a);\n}\n\n#nav svg, #nav img {\n  width: var(--category-icon-size);\n  height: var(--category-icon-size);\n}\n\n#nav[dir=\"rtl\"] .bar {\n  left: auto;\n  right: 0;\n}\n\n#nav .bar {\n  width: 100%;\n  height: 3px;\n  background-color: rgb(var(--em-rgb-accent));\n  transition: transform var(--duration) var(--easing);\n  border-radius: 3px 3px 0 0;\n  position: absolute;\n  bottom: -12px;\n  left: 0;\n}\n\n#nav button[aria-selected] {\n  color: rgb(var(--em-rgb-accent));\n}\n\n#preview {\n  z-index: 2;\n  padding: calc(var(--padding)  + 4px) var(--padding);\n  padding-right: var(--sidebar-width);\n  position: relative;\n}\n\n#preview .preview-placeholder {\n  font-size: var(--preview-placeholder-size);\n}\n\n#preview .preview-title {\n  font-size: var(--preview-title-size);\n}\n\n#preview .preview-subtitle {\n  font-size: var(--preview-subtitle-size);\n}\n\n#nav:before, #preview:before {\n  content: \"\";\n  height: 2px;\n  position: absolute;\n  left: 0;\n  right: 0;\n}\n\n#nav[data-position=\"top\"]:before, #preview[data-position=\"top\"]:before {\n  background: linear-gradient(to bottom, var(--em-color-border), transparent);\n  top: 100%;\n}\n\n#nav[data-position=\"bottom\"]:before, #preview[data-position=\"bottom\"]:before {\n  background: linear-gradient(to top, var(--em-color-border), transparent);\n  bottom: 100%;\n}\n\n.category:last-child {\n  min-height: calc(100% + 1px);\n}\n\n.category button {\n  font-family: -apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif;\n  position: relative;\n}\n\n.category button > * {\n  position: relative;\n}\n\n.category button .background {\n  opacity: 0;\n  background-color: var(--em-color-border);\n  transition: opacity var(--duration-fast) var(--easing) var(--duration-instant);\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  left: 0;\n  right: 0;\n}\n\n.category button:hover .background {\n  transition-duration: var(--duration-instant);\n  transition-delay: 0s;\n}\n\n.category button[aria-selected] .background {\n  opacity: 1;\n}\n\n.category button[data-keyboard] .background {\n  transition: none;\n}\n\n.row {\n  width: 100%;\n  position: absolute;\n  top: 0;\n  left: 0;\n}\n\n.skin-tone-button {\n  border: 1px solid rgba(0, 0, 0, 0);\n  border-radius: 100%;\n}\n\n.skin-tone-button:hover {\n  border-color: var(--em-color-border);\n}\n\n.skin-tone-button:active .skin-tone {\n  transform: scale(.85) !important;\n}\n\n.skin-tone-button .skin-tone {\n  transition: transform var(--duration) var(--easing);\n}\n\n.skin-tone-button[aria-selected] {\n  background-color: var(--em-color-border);\n  border-top-color: rgba(0, 0, 0, .05);\n  border-bottom-color: rgba(0, 0, 0, 0);\n  border-left-width: 0;\n  border-right-width: 0;\n}\n\n.skin-tone-button[aria-selected] .skin-tone {\n  transform: scale(.9);\n}\n\n.menu {\n  z-index: 2;\n  white-space: nowrap;\n  border: 1px solid var(--em-color-border);\n  background-color: rgba(var(--em-rgb-background), .9);\n  -webkit-backdrop-filter: blur(4px);\n  backdrop-filter: blur(4px);\n  transition-property: opacity, transform;\n  transition-duration: var(--duration);\n  transition-timing-function: var(--easing);\n  border-radius: 10px;\n  padding: 4px;\n  position: absolute;\n  box-shadow: 1px 1px 5px rgba(0, 0, 0, .05);\n}\n\n.menu.hidden {\n  opacity: 0;\n}\n\n.menu[data-position=\"bottom\"] {\n  transform-origin: 100% 100%;\n}\n\n.menu[data-position=\"bottom\"].hidden {\n  transform: scale(.9)rotate(-3deg)translateY(5%);\n}\n\n.menu[data-position=\"top\"] {\n  transform-origin: 100% 0;\n}\n\n.menu[data-position=\"top\"].hidden {\n  transform: scale(.9)rotate(3deg)translateY(-5%);\n}\n\n.menu input[type=\"radio\"] {\n  clip: rect(0 0 0 0);\n  width: 1px;\n  height: 1px;\n  border: 0;\n  margin: 0;\n  padding: 0;\n  position: absolute;\n  overflow: hidden;\n}\n\n.menu input[type=\"radio\"]:checked + .option {\n  box-shadow: 0 0 0 2px rgb(var(--em-rgb-accent));\n}\n\n.option {\n  width: 100%;\n  border-radius: 6px;\n  padding: 4px 6px;\n}\n\n.option:hover {\n  color: #fff;\n  background-color: rgb(var(--em-rgb-accent));\n}\n\n.skin-tone {\n  width: 16px;\n  height: 16px;\n  border-radius: 100%;\n  display: inline-block;\n  position: relative;\n  overflow: hidden;\n}\n\n.skin-tone:after {\n  content: \"\";\n  mix-blend-mode: overlay;\n  background: linear-gradient(rgba(255, 255, 255, .2), rgba(0, 0, 0, 0));\n  border: 1px solid rgba(0, 0, 0, .8);\n  border-radius: 100%;\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  left: 0;\n  right: 0;\n  box-shadow: inset 0 -2px 3px #000, inset 0 1px 2px #fff;\n}\n\n.skin-tone-1 {\n  background-color: #ffc93a;\n}\n\n.skin-tone-2 {\n  background-color: #ffdab7;\n}\n\n.skin-tone-3 {\n  background-color: #e7b98f;\n}\n\n.skin-tone-4 {\n  background-color: #c88c61;\n}\n\n.skin-tone-5 {\n  background-color: #a46134;\n}\n\n.skin-tone-6 {\n  background-color: #5d4437;\n}\n\n[data-index] {\n  justify-content: space-between;\n}\n\n[data-emoji-set=\"twitter\"] .skin-tone:after {\n  box-shadow: none;\n  border-color: rgba(0, 0, 0, .5);\n}\n\n[data-emoji-set=\"twitter\"] .skin-tone-1 {\n  background-color: #fade72;\n}\n\n[data-emoji-set=\"twitter\"] .skin-tone-2 {\n  background-color: #f3dfd0;\n}\n\n[data-emoji-set=\"twitter\"] .skin-tone-3 {\n  background-color: #eed3a8;\n}\n\n[data-emoji-set=\"twitter\"] .skin-tone-4 {\n  background-color: #cfad8d;\n}\n\n[data-emoji-set=\"twitter\"] .skin-tone-5 {\n  background-color: #a8805d;\n}\n\n[data-emoji-set=\"twitter\"] .skin-tone-6 {\n  background-color: #765542;\n}\n\n[data-emoji-set=\"google\"] .skin-tone:after {\n  box-shadow: inset 0 0 2px 2px rgba(0, 0, 0, .4);\n}\n\n[data-emoji-set=\"google\"] .skin-tone-1 {\n  background-color: #f5c748;\n}\n\n[data-emoji-set=\"google\"] .skin-tone-2 {\n  background-color: #f1d5aa;\n}\n\n[data-emoji-set=\"google\"] .skin-tone-3 {\n  background-color: #d4b48d;\n}\n\n[data-emoji-set=\"google\"] .skin-tone-4 {\n  background-color: #aa876b;\n}\n\n[data-emoji-set=\"google\"] .skin-tone-5 {\n  background-color: #916544;\n}\n\n[data-emoji-set=\"google\"] .skin-tone-6 {\n  background-color: #61493f;\n}\n\n[data-emoji-set=\"facebook\"] .skin-tone:after {\n  border-color: rgba(0, 0, 0, .4);\n  box-shadow: inset 0 -2px 3px #000, inset 0 1px 4px #fff;\n}\n\n[data-emoji-set=\"facebook\"] .skin-tone-1 {\n  background-color: #f5c748;\n}\n\n[data-emoji-set=\"facebook\"] .skin-tone-2 {\n  background-color: #f1d5aa;\n}\n\n[data-emoji-set=\"facebook\"] .skin-tone-3 {\n  background-color: #d4b48d;\n}\n\n[data-emoji-set=\"facebook\"] .skin-tone-4 {\n  background-color: #aa876b;\n}\n\n[data-emoji-set=\"facebook\"] .skin-tone-5 {\n  background-color: #916544;\n}\n\n[data-emoji-set=\"facebook\"] .skin-tone-6 {\n  background-color: #61493f;\n}\n\n";










//# sourceMappingURL=main.js.map
