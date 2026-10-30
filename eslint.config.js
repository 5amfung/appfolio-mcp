import js from '@eslint/js'
import pluginStart from '@tanstack/eslint-plugin-start'
import drizzle from 'eslint-plugin-drizzle'
import prettier from 'eslint-config-prettier/flat'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'drizzle/**',
      '.tanstack/**',
      'src/routeTree.gen.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginStart.configs['flat/recommended'].map((config) => ({
    ...config,
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  })),
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { drizzle },
    rules: {
      'drizzle/enforce-delete-with-where': 'error',
      'drizzle/enforce-update-with-where': 'error',
    },
  },
  prettier,
]
