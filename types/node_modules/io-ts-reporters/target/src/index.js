"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = exports.formatValidationErrors = exports.formatValidationError = exports.TYPE_MAX_LEN = void 0;
/**
 * An [io-ts Reporter](https://gcanti.github.io/io-ts/modules/Reporter.ts.html#reporter-interface).
 *
 * @example
 *
 * import * as t from 'io-ts';
 * import Reporter from 'io-ts-reporters';
 *
 * const User = t.interface({ name: t.string });
 *
 * assert.deepEqual(
 *   Reporter.report(User.decode({ nam: 'Jane' })),
 *   ['Expecting string at name but instead got: undefined'],
 * )
 * assert.deepEqual( Reporter.report(User.decode({ name: 'Jane' })), [])
 *
 * @since 1.2.0
 */
var A = require("fp-ts/Array");
var E = require("fp-ts/Either");
var NEA = require("fp-ts/NonEmptyArray");
var O = require("fp-ts/Option");
var R = require("fp-ts/Record");
var pipeable_1 = require("fp-ts/pipeable");
var t = require("io-ts");
var utils_1 = require("./utils");
var isUnionType = function (_a) {
    var type = _a.type;
    return type instanceof t.UnionType;
};
var jsToString = function (value) {
    return value === undefined ? 'undefined' : JSON.stringify(value);
};
var keyPath = function (ctx) {
    // The context entry with an empty key is the original
    // type ("default context"), not a type error.
    return ctx
        .map(function (c) { return c.key; })
        .filter(Boolean)
        .join('.');
};
// The actual error is last in context
var getErrorFromCtx = function (validation) {
    // https://github.com/gcanti/fp-ts/pull/544/files
    return A.last(validation.context);
};
var getValidationContext = function (validation) {
    // https://github.com/gcanti/fp-ts/pull/544/files
    return validation.context;
};
/**
 * @category internals
 * @since 1.2.1
 */
exports.TYPE_MAX_LEN = 160; // Two lines of 80-col text
var truncateType = function (type, options) {
    if (options === void 0) { options = {}; }
    var _a = options.truncateLongTypes, truncateLongTypes = _a === void 0 ? true : _a;
    if (truncateLongTypes && type.length > exports.TYPE_MAX_LEN) {
        return type.slice(0, exports.TYPE_MAX_LEN - 3) + "...";
    }
    return type;
};
var errorMessageSimple = function (expectedType, path, error, options) {
    // https://github.com/elm-lang/core/blob/18c9e84e975ed22649888bfad15d1efdb0128ab2/src/Native/Json.js#L199
    return [
        "Expecting " + truncateType(expectedType, options),
        path === '' ? '' : "at " + path,
        "but instead got: " + jsToString(error.value),
        error.message ? "(" + error.message + ")" : '',
    ]
        .filter(Boolean)
        .join(' ');
};
var errorMessageUnion = function (expectedTypes, path, value, options) {
    // https://github.com/elm-lang/core/blob/18c9e84e975ed22649888bfad15d1efdb0128ab2/src/Native/Json.js#L199
    return [
        'Expecting one of:\n',
        expectedTypes
            .map(function (type) { return "    " + truncateType(type, options); })
            .join('\n'),
        path === '' ? '\n' : "\nat " + path + " ",
        "but instead got: " + jsToString(value),
    ]
        .filter(Boolean)
        .join('');
};
// Find the union type in the list of ContextEntry
// The next ContextEntry should be the type of this branch of the union
var findExpectedType = function (ctx) {
    return pipeable_1.pipe(ctx, A.findIndex(isUnionType), O.chain(function (n) { return A.lookup(n + 1, ctx); }));
};
var formatValidationErrorOfUnion = function (path, errors, options) {
    var expectedTypes = pipeable_1.pipe(errors, A.map(getValidationContext), A.map(findExpectedType), A.compact);
    var value = pipeable_1.pipe(expectedTypes, A.head, O.map(function (v) { return v.actual; }), O.getOrElse(function () { return undefined; }));
    var expected = expectedTypes.map(function (_a) {
        var type = _a.type;
        return type.name;
    });
    return expected.length > 0
        ? O.some(errorMessageUnion(expected, path, value, options))
        : O.none;
};
var formatValidationCommonError = function (path, error, options) {
    return pipeable_1.pipe(error, getErrorFromCtx, O.map(function (errorContext) {
        return errorMessageSimple(errorContext.type.name, path, error, options);
    }));
};
var groupByKey = NEA.groupBy(function (error) {
    return pipeable_1.pipe(error.context, utils_1.takeUntil(isUnionType), keyPath);
});
var format = function (path, errors, options) {
    return NEA.tail(errors).length > 0
        ? formatValidationErrorOfUnion(path, errors, options)
        : formatValidationCommonError(path, NEA.head(errors), options);
};
/**
 * Format a single validation error.
 *
 * @category formatters
 * @since 1.0.0
 */
var formatValidationError = function (error, options) { return formatValidationCommonError(keyPath(error.context), error, options); };
exports.formatValidationError = formatValidationError;
/**
 * Format validation errors (`t.Errors`).
 *
 * @example
 * import * as E from 'fp-ts/Either'
 * import * as t from 'io-ts'
 * import { formatValidationErrors } from 'io-ts-reporters'
 *
 * const result = t.string.decode(123)
 *
 * assert.deepEqual(
 *   E.mapLeft(formatValidationErrors)(result),
 *   E.left(['Expecting string but instead got: 123'])
 * )
 *
 * @category formatters
 * @since 1.2.0
 */
var formatValidationErrors = function (errors, options) {
    return pipeable_1.pipe(errors, groupByKey, R.mapWithIndex(function (path, errors) { return format(path, errors, options); }), R.compact, R.toArray, A.map(function (_a) {
        var _key = _a[0], error = _a[1];
        return error;
    }));
};
exports.formatValidationErrors = formatValidationErrors;
/**
 * Deprecated, use the default export instead.
 *
 * @category deprecated
 * @deprecated
 * @since 1.0.0
 */
var reporter = function (validation, options) {
    return pipeable_1.pipe(validation, E.mapLeft(function (errors) { return exports.formatValidationErrors(errors, options); }), E.fold(function (errors) { return errors; }, function () { return []; }));
};
exports.reporter = reporter;
var prettyReporter = { report: exports.reporter };
exports.default = prettyReporter;
//# sourceMappingURL=index.js.map