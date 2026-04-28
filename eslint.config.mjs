import js from '@eslint/js';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import globals from 'globals';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'prisma/generated/**',
      'public/**',
      'coverage/**',
      'next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...nextCoreWebVitals,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'react/no-unescaped-entities': 'off',
      'react/react-in-jsx-scope': 'off',
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    // CLI scripts and bulk-data utilities — not Next pages/routes.
    files: ['scripts/**/*.{js,mjs}'],
    rules: {
      '@next/next/no-assign-module-variable': 'off',
    },
  },
];

export default config;
