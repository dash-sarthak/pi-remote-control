import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import pirc from '@pirc/tooling/eslint-plugin';

/** Expo's recommended rules plus the repository's comment rules. */
export default defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*'],
  },
  {
    plugins: { pirc },
    rules: {
      'pirc/no-banner-comments': 'error',
      'no-console': 'error',
    },
  },
]);
