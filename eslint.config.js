"use strict";

module.exports = [
  {
    files: ["lib/**/*.js", "bin/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: { require: "readonly", module: "writable", process: "readonly", __dirname: "readonly" },
    },
    rules: {
      "no-unused-vars": "error",
      "no-undef": "error",
    },
  },
  { ignores: ["tests/fixtures/**"] },
];
