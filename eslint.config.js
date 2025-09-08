// Flat ESLint config for ESLint v9+
// TypeScript + ESM + Prettier friendly
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';
// Avoid external 'globals' dependency; declare common Node globals explicitly

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'vitest.config.ts']
  },
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly'
      }
    }
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        // Enable type-aware linting
        project: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      // Align with project style
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],
      // Prefer TS plugin version; disable base in TS
      'no-unused-vars': 'off',
      'no-undef': 'off',
      // Empty blocks are sometimes used for noop/try-catch
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // Allow ESC control char in regex for terminal handling
      'no-control-regex': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/consistent-type-imports': 'error'
    }
  },
  {
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly'
      }
    }
  },
  // Put Prettier last to disable conflicting stylistic rules
  prettier
];
