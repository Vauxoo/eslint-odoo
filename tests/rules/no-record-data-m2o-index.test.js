"use strict";

const { RuleTester } = require("eslint");
const rule = require("../../lib/rules/no-record-data-m2o-index");

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-record-data-m2o-index", rule, {
  valid: [
    // Receiver is not a record: the raw result of a read()/search_read() over RPC is
    // still the [id, display_name] pair in 19.0, so [0] is correct there. Taken from a
    // real 19.0 codebase, where this line is correct and must not be rewritten.
    "this._subscription.timezone_id[0];",
    // Guarded by Array.isArray, and the receiver is a plain dict from the server.
    "line.product_id = Array.isArray(line.product_id) ? line.product_id[0] : line.product_id;",
    "const x = someOrder.partner_id[0];",
    // Already migrated.
    "record.data.product_id?.id;",
    "record.data.product_id.id;",
    // Not a many2one field name.
    "record.data.values[0];",
    "record.data.tag_ids[0];",
    // Not index 0.
    "record.data.product_id[1];",
  ],

  invalid: [
    {
      // Real defect: a patch on the order line's product field compared the record's
      // product against the one a dialog had configured, so the price was never applied.
      code: "record.product_id[0] === product_id",
      output: "record.product_id?.id === product_id",
      errors: [{ messageId: "indexedMany2one", data: { field: "product_id" } }],
    },
    {
      // Real defect: a list renderer opened a record with res_id undefined on cell click.
      code: "resId = record.data.related_id[0];",
      output: "resId = record.data.related_id?.id;",
      errors: [{ messageId: "indexedMany2one" }],
    },
    {
      code: "const id = this.props.record.data.partner_id[0];",
      output: "const id = this.props.record.data.partner_id?.id;",
      errors: [{ messageId: "indexedMany2one" }],
    },
    {
      code: "if (record.product_template_id[0] === tmplId) {}",
      output: "if (record.product_template_id?.id === tmplId) {}",
      errors: [{ messageId: "indexedMany2one" }],
    },
    {
      // Two on one line, both fixed.
      code: "a(record.data.x_id[0], record.data.y_id[0]);",
      output: "a(record.data.x_id?.id, record.data.y_id?.id);",
      errors: [{ messageId: "indexedMany2one" }, { messageId: "indexedMany2one" }],
    },
    {
      // Spacing is normalised by the fix.
      code: "record.data.partner_id[ 0 ];",
      output: "record.data.partner_id?.id;",
      errors: [{ messageId: "indexedMany2one" }],
    },
  ],
});
