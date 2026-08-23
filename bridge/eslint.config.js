const eslint = require('@eslint/js')
const tseslint = require('typescript-eslint')
const figmaPlugin = require('@figma/eslint-plugin-figma-plugins')
const globals = require('globals')

module.exports = tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      // @figma/figma-plugins rules such as ban-deprecated-sync-prop-setters need
      // type information. Without projectService they don't merely skip — ESLint
      // hard-errors the moment one of them meets a matching node, which is why
      // linting appeared to pass until the first dynamic property assignment.
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs'],
        },
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    plugins: {
      '@figma/figma-plugins': figmaPlugin,
    },
    rules: {
      ...figmaPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    ignores: ['code.js', 'dist', 'eslint.config.js'],
  },
)
