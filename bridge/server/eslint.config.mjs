import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  {
    files: ["**/*.js", "**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        figma: "readonly",
        parent: "readonly",
      },
    },
  },
  pluginJs.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
