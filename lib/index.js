/**
 * @fileoverview eslint-plugin-odoo: ESLint rules for Odoo JavaScript.
 */

"use strict";

const noRecordDataM2oIndex = require("./rules/no-record-data-m2o-index");
const noUnresolvedOdooImport = require("./rules/no-unresolved-odoo-import");

const { name, version } = require("../package.json");

const plugin = {
  meta: { name, version },
  rules: {
    "no-record-data-m2o-index": noRecordDataM2oIndex,
    "no-unresolved-odoo-import": noUnresolvedOdooImport,
  },
};

// Flat config presets. `recommended` leaves no-unresolved-odoo-import off, because it
// does nothing useful until the consumer points it at a real addons path.
plugin.configs = {
  recommended: {
    plugins: { odoo: plugin },
    rules: {
      "odoo/no-record-data-m2o-index": "error",
    },
  },
  all: {
    plugins: { odoo: plugin },
    rules: {
      "odoo/no-record-data-m2o-index": "error",
      "odoo/no-unresolved-odoo-import": "error",
    },
  },
};

module.exports = plugin;
