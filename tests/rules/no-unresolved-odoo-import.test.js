"use strict";

const path = require("path");
const { RuleTester } = require("eslint");
const rule = require("../../lib/rules/no-unresolved-odoo-import");

const ADDONS = [path.resolve(__dirname, "../fixtures/addons")];
const options = [{ addonsPath: ADDONS }];

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("no-unresolved-odoo-import", rule, {
  valid: [
    // Name is exported by the target.
    { code: 'import {setElementContent} from "@web/core/utils/html";', options },
    // Re-exported through `export { x } from "..."`.
    { code: 'import {urlToState} from "@web/core/browser/router";', options },
    // Aliases are not paths and are always accepted.
    { code: 'import {markup, Component} from "@odoo/owl";', options },
    // Relative imports are out of scope.
    { code: 'import {thing} from "./local";', options },
    // Default and namespace imports carry no name to verify against the target.
    { code: 'import options from "@web/core/utils/html";', options },
    { code: 'import * as all from "@web/core/utils/html";', options },
    // With no addons path configured the rule stays silent instead of flagging everything.
    { code: 'import {nope} from "@web/does/not/exist";', options: [{ addonsPath: [] }] },
  ],

  invalid: [
    {
      // The module exists, the name is gone: the 18.0 export was dropped in 19.0.
      code: 'import {htmlEscape} from "@web/core/utils/html";',
      options,
      errors: [{ messageId: "missingExport", data: { name: "htmlEscape", spec: "@web/core/utils/html" } }],
    },
    {
      // The module itself does not exist in this version; it moved elsewhere.
      code: 'import {SignableDocument} from "@sign/js/common/document_signable";',
      options,
      errors: [{ messageId: "unresolvedModule", data: { spec: "@sign/js/common/document_signable" } }],
    },
    {
      // Exported by exactly one other module and imported alone: rewritten.
      code: 'import {onlyHere} from "@web/core/utils/html";',
      output: 'import {onlyHere} from "@mymod/only_here";',
      options,
      errors: [{ messageId: "missingExportFixable" }],
    },
    {
      // Same missing name, but the statement carries a name that does resolve here.
      // Repointing it would break `setElementContent`, so it is reported without a fix.
      code: 'import {setElementContent, onlyHere} from "@web/core/utils/html";',
      output: null,
      options,
      errors: [{ messageId: "missingExportFixable" }],
    },
    {
      // Nothing exports it: reported, never guessed.
      code: 'import {neverDefinedAnywhere} from "@web/core/utils/html";',
      options,
      errors: [{ messageId: "missingExport" }],
    },
  ],
});
