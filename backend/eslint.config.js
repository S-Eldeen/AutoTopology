import js from '@eslint/js';

const nodeGlobals = {
  Buffer: 'readonly',
  console: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  fetch: 'readonly',
  process: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  URL: 'readonly',
};

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
