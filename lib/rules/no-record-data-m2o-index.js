/**
 * @fileoverview Forbid indexing a many2one of `record.data` with [0].
 *
 * Odoo 18.0 stored a many2one in the web client's relational model as the pair
 * `[id, display_name]`. Odoo 19.0 stores an object `{id, display_name}`, so `[0]`
 * silently evaluates to `undefined`: no exception, no console error, the branch
 * that reads it simply stops being taken.
 *
 * Only `record.data.<field>` (and `record.<field>`) changed shape. The raw result of a
 * `read`/`search_read` over RPC is still the pair, and indexing that with [0] stays
 * correct, so this rule deliberately requires the receiver to be a record.
 */

"use strict";

/** Receivers whose many2one values come from the relational model. */
function isRecordReceiver(node) {
  // `record.<field>[0]` / `rec.<field>[0]` -- a bare identifier called record.
  if (node.type === "Identifier") {
    return /^(record|rec)$/.test(node.name);
  }
  if (node.type !== "MemberExpression" || node.computed) {
    return false;
  }
  const prop = node.property;
  if (prop.type !== "Identifier") {
    return false;
  }
  // `<anything>.data.<field>[0]` -- the relational model's data bag.
  if (prop.name === "data") {
    return true;
  }
  // `this.props.record.<field>[0]`, `x.record.<field>[0]`
  return prop.name === "record";
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow indexing a many2one of a record with [0]; in Odoo 19.0 it is an object",
      recommended: true,
    },
    fixable: "code",
    schema: [],
    messages: {
      indexedMany2one:
        "'{{field}}' is a many2one of a record: in Odoo 19.0 it is an object, so [0] is undefined. Use '?.id'.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();

    return {
      MemberExpression(node) {
        // Shape: <object>[0]
        if (!node.computed || node.property.type !== "Literal" || node.property.value !== 0) {
          return;
        }
        const object = node.object;
        // <object> must itself be `<receiver>.<something>_id`
        if (object.type !== "MemberExpression" || object.computed) {
          return;
        }
        const field = object.property;
        if (field.type !== "Identifier" || !/_id$/.test(field.name)) {
          return;
        }
        if (!isRecordReceiver(object.object)) {
          return;
        }

        context.report({
          node,
          messageId: "indexedMany2one",
          data: { field: field.name },
          fix(fixer) {
            // Replace the `[0]` slice with `?.id`, keeping the receiver untouched.
            // A many2one with no value is `false`, hence the optional chaining.
            const start = object.range[1];
            const end = node.range[1];
            const between = sourceCode.getText().slice(start, end);
            // Only rewrite the plain `[0]` form; anything with comments inside is left alone.
            if (!/^\s*\[\s*0\s*\]$/.test(between)) {
              return null;
            }
            return fixer.replaceTextRange([start, end], "?.id");
          },
        });
      },
    };
  },
};
