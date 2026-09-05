import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["**/dist/**", "**/node_modules/**", "**/*.config.ts", "**/*.config.js", "tools/**"],
    },

    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,

    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": "error",
            "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "separate-type-imports" }],
            "@typescript-eslint/no-unnecessary-condition": "off",
            "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
            "no-console": "error",
            eqeqeq: ["error", "always"],
        },
    },

    {
        // A plugin's internals are private: another reaches it through
        // `api.ts`. And the pure entry runs in a worker or on a server, so it
        // may not reach React: `./react` is where a component lives.
        //
        // One block, because a flat config replaces this rule rather than
        // merging it: a second block naming it would drop the first.
        files: ["src/**/*.{ts,tsx}"],
        ignores: ["src/index.ts", "src/testing.ts", "src/**/react/**", "src/**/*.test.{ts,tsx}", "src/**/tests/**"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["react", "react-dom", "react/*", "react-dom/*"],
                            allowTypeImports: true,
                            message: "The pure entry imports no React value. A type is erased and allowed; a hook or a component belongs in a `react/` folder, which the `./react` entry exports.",
                        },
                        {
                            group: ["../*/internal/*", "../../*/internal/*", "**/plugins/*/internal/*"],
                            message: "A plugin reaches another only through its `api.ts`. What is under `internal/` is private to the plugin that owns it.",
                        },
                    ],
                },
            ],
        },
    },

    {
        files: ["**/*.test.ts", "**/*.test.tsx", "**/tests/**"],
        rules: {
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/require-await": "off",
            "@typescript-eslint/no-base-to-string": "off",
            "@typescript-eslint/only-throw-error": "off",
            "@typescript-eslint/no-unused-expressions": "off",
        },
    },
);
