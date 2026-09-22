import { defineConfig } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const common = {
  "@next/next": nextPlugin,
  "react-hooks": reactHooks,
  "@typescript-eslint": tsPlugin,
};

export default defineConfig([
  {
    ignores: [".next/**", "out/**", "build/**", "coverage/**", "node_modules/**", "next-env.d.ts"],
  },
  {
    files: ["**/*.{js,cjs,mjs,jsx}"],
    plugins: common,
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.flat.recommended.rules,
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: common,
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.flat.recommended.rules,
    },
  },
]);
