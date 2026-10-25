import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';
import pirc from './packages/tooling/src/eslint-plugin.js';

/**
 * Lint rules for the Node workspaces (packages/*, apps/bridge) and repository
 * scripts. apps/mobile has its own config built on eslint-config-expo and
 * shares the docstring and comment rules from here.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.expo/**',
      '**/.turbo/**',
      '**/coverage/**',
      'apps/mobile/**',
      'audit/**',
    ],
  },
  {
    files: ['**/*.{ts,js,mjs}'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.js', '.agents/skills/*/scripts/*.mjs'] },
      },
    },
    plugins: { jsdoc, pirc },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ClassDeclaration: true, MethodDefinition: true },
          contexts: [
            'TSInterfaceDeclaration',
            'TSTypeAliasDeclaration',
            'ExportNamedDeclaration > VariableDeclaration',
          ],
        },
      ],
      'pirc/no-banner-comments': 'error',
      'no-console': 'error',
    },
  },
  {
    files: ['**/test/**/*.ts', '**/*.config.{ts,js}'],
    rules: { 'jsdoc/require-jsdoc': 'off' },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
