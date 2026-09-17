#!/usr/bin/env node
/**
 * @fileoverview Run the odoo rules over the given files without a project ESLint config.
 *
 * This is what the pre-commit hook calls. It deliberately ignores any eslint.config.js of
 * the repository being checked, so enabling these rules never drags a project's own
 * lint setup into the run.
 */

"use strict";

const { ESLint } = require("eslint");
const plugin = require("../lib/index.js");

function parseArgs(argv) {
  const files = [];
  const addonsPath = [];
  let fix = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--fix") {
      fix = true;
    } else if (arg === "--addons-path") {
      addonsPath.push(...String(argv[++i] || "").split(",").filter(Boolean));
    } else if (arg.startsWith("--addons-path=")) {
      addonsPath.push(...arg.slice("--addons-path=".length).split(",").filter(Boolean));
    } else if (arg === "--help" || arg === "-h") {
      return null;
    } else {
      files.push(arg);
    }
  }
  return { files, addonsPath, fix };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed || !parsed.files.length) {
    process.stdout.write(
      "usage: eslint-odoo [--fix] [--addons-path DIR[,DIR...]] FILE...\n\n" +
        "Runs the eslint-plugin-odoo rules. Without --addons-path the import\n" +
        "resolution rule stays silent, since it has nothing to resolve against.\n"
    );
    return parsed ? 1 : 0;
  }
  const { files, addonsPath, fix } = parsed;

  const rules = {
    "odoo/no-record-data-m2o-index": "error",
    "odoo/no-unresolved-odoo-import": addonsPath.length
      ? ["error", { addonsPath }]
      : "off",
  };

  const eslint = new ESLint({
    fix,
    overrideConfigFile: true, // ignore the checked repository's own config
    overrideConfig: [
      {
        files: ["**/*.js", "**/*.esm.js"],
        languageOptions: { ecmaVersion: "latest", sourceType: "module" },
        plugins: { odoo: plugin },
        rules,
      },
    ],
  });

  const results = await eslint.lintFiles(files);
  if (fix) {
    await ESLint.outputFixes(results);
  }
  const formatter = await eslint.loadFormatter("stylish");
  const output = await formatter.format(results);
  if (output) {
    process.stdout.write(output + "\n");
  }
  return results.some((r) => r.errorCount > 0) ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(String((err && err.stack) || err) + "\n");
    process.exit(2);
  }
);
