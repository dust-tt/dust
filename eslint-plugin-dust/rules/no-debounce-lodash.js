"use strict";

module.exports = {
    meta: {
        type: "problem",
        docs: {
            description:
                "Disallow importing lodash debounce in favour of pDebounce",
            recommended: true,
            url: "https://lodash.com/docs/4.17.15#lodash",
            explanation: `
        _.debounce doesn't behave as we could expect and can lead to unhandled exceptions, especially when used with async functions.
        
        **Solution**: Use p-debounce instead.
        
        **Behavior difference**:
        
        ***Unexpected behavior (success)***:
        const success = async () => 7;

        const debouncedSuccess = _.debounce(success, 1000);
        const pDebouncedSuccess = pDebounce(success, 2000);

        expect(await debouncedSuccess()).toBe(7); // fails it's "undefined"
        expect(await pDebouncedSuccess()).toBe(7); // succeeds it's "7"
        
        ***Unexpected behavior (exception)***:
        const failureLodash = async () => { throw new Error("Error from lodash"); };
        const failurePDebounce = async () => { throw new Error("Error from pDebounce"); };
        
        try {
          const debouncedFailure = _.debounce(failureLodash, 1000);
          await debouncedFailure();
        } catch (e) {
          expect((e as Error).message).toBe("Error from lodash"); // this doesn't work the exception is not caught, as it's raised from the line in failureLodash
        }
        
        try {
          const pDebouncedFailure = pDebounce(failurePDebounce, 2000);
          await pDebouncedFailure();
        } catch (e) {
          expect((e as Error).message).toBe("Error from pDebounce"); // work as I expect, the exception is caught
        }
        
        ***Uncaught exception***:
        We could think the code from above could be fixed by wrapping the lodash function in a try/catch block, but this doesn't work as expected./ 
        
        let failureLodash
        try {
          failureLodash = async () => {
            throw new Error("Error from lodash");
          };
        } catch (e) {
          expect(1).toBe(2);  // never called
        }
        
        try {
          const debouncedFailure = _.debounce(failureLodash, 1000);
          await debouncedFailure();
        } catch (e) {
          expect((e as Error).message).toBe("Error from lodash");
        }
        
        
        **Example**:
        ❌ Bad:  import { debounce } from 'lodash';
        ✅ Good: import pDebounce from 'p-debounce';
      `,
        },
        fixable: "code",
        schema: [],
    },

    create(context) {
        return {
            ImportDeclaration(node) {
                if (
                    node.source.value === "lodash" &&
                    node.specifiers.length > 0 &&
                    node.specifiers[0].type === "ImportSpecifier"
                ) {
                    const imports = node.specifiers.map((spec) => spec.imported.name).filter((name) => name === "debounce");

                    context.report({
                        node,
                        message: `Don't use lodash debounce, use pDebounce from 'p-debounce' instead.}`,
                        s
                    });
                }
            },
        };
    },
};
