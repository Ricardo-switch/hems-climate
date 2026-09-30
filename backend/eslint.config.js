// De linter (besluit 57). Een handvol regels die in deze code iets vangen,
// geen stijlgids: de compiler staat al op zijn strengst en de rest is smaak.
//
// Voorop de beloften. Deze dienst vuurt veel af zonder te wachten — de
// historieschrijver, de event-handlers, de weergave — en een vergeten `await`
// of een belofte die niemand opvangt is precies het soort fout dat stil blijft.

import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'web/**', 'node_modules/**', 'data/**', 'eslint.config.js'] },
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'tools/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
    },
  },
);
