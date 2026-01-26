"use strict";
module.exports = {
    extends: require.resolve('./csf'),
    rules: {
        'react-hooks/rules-of-hooks': 'off',
        'import/no-anonymous-default-export': 'off',
        'storybook/no-stories-of': 'error',
        'storybook/no-title-property-in-meta': 'error',
    },
};
