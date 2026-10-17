import tseslint from 'typescript-eslint';

// Root config covers the Node/TS workspaces (packages/*, apps/bridge).
// apps/mobile has its own config from eslint-config-expo (create-expo-app).
export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.expo/**',
      '**/.turbo/**',
    ],
  },
  {
    files: [
      'packages/**/src/**/*.ts',
      'packages/**/test/**/*.ts',
      'apps/bridge/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
);
