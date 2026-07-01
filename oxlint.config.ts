import { defineConfig } from 'oxlint';

export default defineConfig({
    plugins: ['eslint', 'typescript', 'node', 'oxc', 'import'],
    options: {
        typeAware: true,
    },
    categories: {
        correctness: 'off',
        suspicious: 'off',
        style: 'off',
        perf: 'off',
        pedantic: 'off',
        restriction: 'off',
        nursery: 'off',
    },
    env: {
        browser: true,
        greasemonkey: true,
        es6: true,
        node: true,
    },
    rules: {
        'prefer-template': 'error',
        'no-inner-declarations': 'warn',
        'no-global-assign': 'warn',
        'no-redeclare': 'warn',
        'no-self-assign': 'warn',
        'no-undef': 'warn',
        'no-useless-concat': 'warn',
        'no-useless-escape': 'warn',
        'no-var': 'warn',
    },
});
