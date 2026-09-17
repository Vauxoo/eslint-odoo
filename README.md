# eslint-odoo

ESLint rules for Odoo JavaScript, aimed at the defects that **fail silently**: code that
keeps loading, logs nothing, and simply stops doing what it says.

Published to npm as [`eslint-plugin-odoo`](https://www.npmjs.com/package/eslint-plugin-odoo).

## Why

Odoo's module loader returns `undefined` for a name a module does not export instead of
raising, and the web client's relational model changed the shape of a many2one between
18.0 and 19.0. Both produce code that still reads as if it worked:

```js
// 18.0: record.data.partner_id is [id, display_name]  -> [0] is the id
// 19.0: record.data.partner_id is {id, display_name}  -> [0] is undefined
if (record.data.partner_id[0] === someId) {
    // never taken in 19.0, and nothing says so
}
```

The failure surfaces the first time the line runs, which is often an error branch nobody
exercises, so a browser tour can pass end to end while the defect is live.

## Rules

| Rule | Fixable | What it catches |
|---|---|---|
| `odoo/no-record-data-m2o-index` | yes | `record.data.<m2o>[0]`, which is `undefined` from 19.0 on |
| `odoo/no-unresolved-odoo-import` | partly | `@addon/...` imports that do not resolve, and names the target does not export |

### `no-record-data-m2o-index`

Reports `[0]` on a many2one reached through a record, and rewrites it to `?.id` (optional
chaining because an empty many2one is `false`).

Only `record.<field>` and `<...>.data.<field>` are reported. The raw result of a
`read`/`search_read` over RPC is **still** the `[id, display_name]` pair in 19.0, so
indexing that is correct and is deliberately left alone:

```js
record.data.partner_id[0]            // reported  -> record.data.partner_id?.id
this.props.record.data.partner_id[0] // reported
someRpcResult.partner_id[0]          // not reported: still a pair
```

### `no-unresolved-odoo-import`

Resolves every `@addon/path` specifier against a real addons path and checks that each
named import exists in the target's exports. It needs no per-version catalogue of what the
core removed: either the module is there and exports the name, or it is not.

It is **off unless you give it an addons path**, since it has nothing to resolve against
otherwise.

```js
// eslint.config.js
const odoo = require("eslint-plugin-odoo");

module.exports = [
  {
    files: ["**/static/src/**/*.js"],
    plugins: { odoo },
    rules: {
      "odoo/no-record-data-m2o-index": "error",
      "odoo/no-unresolved-odoo-import": ["error", {
        addonsPath: ["/opt/odoo/addons", "/opt/extra_addons"],
      }],
    },
  },
];
```

Options:

| Option | Default | Meaning |
|---|---|---|
| `addonsPath` | `[]` | Directories to index for addons. Empty disables the rule. |
| `aliases` | `["@odoo/owl"]` | Specifiers that are aliases, not paths, and are always accepted. |
| `suggestOrigin` | `true` | Look for the module that does export a missing name, to offer a fix. |

A missing name is rewritten **only** when exactly one module in the tree exports it *and*
the import statement brings in that name alone — repointing a statement that carries other
names would break them. Everything else is reported without a fix.

## Use with pre-commit

```yaml
repos:
  - repo: https://github.com/Vauxoo/eslint-odoo
    rev: v0.1.0
    hooks:
      - id: eslint-odoo
        args: ["--addons-path=/opt/odoo/addons,/opt/extra_addons"]
```

The hook ignores the checked repository's own `eslint.config.js`, so enabling these rules
never drags a project's lint setup into the run. Add `--fix` to apply the autofixes.

## Standalone

```bash
npx eslint-plugin-odoo --addons-path=/opt/odoo/addons path/to/module/static/src/**/*.js
```

Paths must be inside the current directory; ESLint ignores files outside it.

## Development

```bash
npm install
npm test     # RuleTester, verifies the autofix output of every rule
npm run lint
```

The test fixtures use the real defects the rules were written from, so a regression shows
up as one of them going undetected.

## License

LGPL-3.0-or-later
