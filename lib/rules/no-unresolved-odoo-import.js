/**
 * @fileoverview Check that `@addon/path` imports resolve and that the names exist.
 *
 * Odoo's module loader hands back `undefined` for a name the target does not export
 * instead of raising, so a rename in the core surfaces only when the line using the
 * symbol runs -- typically an error branch nobody exercises.
 *
 * The rule resolves every `@addon/...` specifier against a real addons path, so it needs
 * no per-version catalogue of what the core removed: either the module is there and
 * exports the name, or it is not.
 */

"use strict";

const fs = require("fs");
const path = require("path");

/** Module specifiers that are aliases rather than paths, and are always available. */
const DEFAULT_ALIASES = ["@odoo/owl"];

const EXPORT_NAMED =
  /^export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_BRACE = /^export\s*\{([^}]*)\}/gm;
const EXPORT_STAR = /^export\s*\*\s*from\s*["']([^"']+)["']/gm;

/** addon name -> directory, discovered from __manifest__.py, cached per addonsPath. */
const addonIndexCache = new Map();
const exportsCache = new Map();

function buildAddonIndex(addonsPath) {
  const key = addonsPath.join(":");
  if (addonIndexCache.has(key)) {
    return addonIndexCache.get(key);
  }
  const index = new Map();
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isFile() && e.name === "__manifest__.py")) {
      if (!index.has(path.basename(dir))) {
        index.set(path.basename(dir), dir);
      }
      return; // an addon does not nest another addon
    }
    for (const e of entries) {
      if (e.isDirectory() && !["node_modules", "static", ".git"].includes(e.name)) {
        walk(path.join(dir, e.name), depth + 1);
      }
    }
  };
  for (const base of addonsPath) {
    walk(base, 0);
  }
  addonIndexCache.set(key, index);
  return index;
}

function resolveSpecifier(spec, addonsPath) {
  const slash = spec.indexOf("/");
  if (slash === -1) return null;
  const addon = spec.slice(1, slash);
  const rest = spec.slice(slash + 1);
  const dir = buildAddonIndex(addonsPath).get(addon);
  if (!dir || !rest) return null;
  for (const candidate of [
    path.join(dir, "static", "src", `${rest}.js`),
    path.join(dir, "static", "src", rest, "index.js"),
    path.join(dir, "static", `${rest}.js`),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function exportedNames(file, addonsPath, seen = new Set()) {
  if (seen.has(file) || seen.size > 8) return new Set();
  seen.add(file);
  if (exportsCache.has(file) && seen.size === 1) {
    return exportsCache.get(file);
  }
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return new Set();
  }
  const names = new Set();
  for (const m of text.matchAll(EXPORT_NAMED)) names.add(m[1]);
  for (const m of text.matchAll(EXPORT_BRACE)) {
    for (const part of m[1].split(",")) {
      const cleaned = part.trim();
      if (cleaned) names.add(cleaned.split(/\s+as\s+/).pop().trim());
    }
  }
  if (/^export\s+default/m.test(text)) names.add("default");
  // `export * from "..."` re-exports everything the target exports.
  for (const m of text.matchAll(EXPORT_STAR)) {
    const target = m[1].startsWith(".")
      ? resolveRelative(file, m[1])
      : resolveSpecifier(m[1], addonsPath);
    if (target) {
      for (const n of exportedNames(target, addonsPath, seen)) names.add(n);
    }
  }
  if (seen.size === 1) exportsCache.set(file, names);
  return names;
}

function resolveRelative(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  for (const candidate of [base, `${base}.js`, path.join(base, "index.js")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Modules that export `name`, as `@addon/rest` specifiers. Used to offer a fix. */
function findExporters(name, addonsPath) {
  const out = [];
  for (const [addon, dir] of buildAddonIndex(addonsPath)) {
    const root = path.join(dir, "static", "src");
    const stack = [root];
    while (stack.length) {
      const current = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        const full = path.join(current, e.name);
        if (e.isDirectory()) {
          if (!["node_modules", "lib", "tests"].includes(e.name)) stack.push(full);
        } else if (e.name.endsWith(".js")) {
          if (exportedNames(full, addonsPath).has(name)) {
            const rest = path.relative(root, full).replace(/\.js$/, "");
            out.push(`@${addon}/${rest.split(path.sep).join("/")}`);
          }
        }
      }
    }
  }
  return out;
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "check that @addon/... imports resolve and that the imported names are exported",
      recommended: true,
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          addonsPath: { type: "array", items: { type: "string" } },
          aliases: { type: "array", items: { type: "string" } },
          suggestOrigin: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unresolvedModule: "Module '{{spec}}' does not resolve to any file under the addons path.",
      missingExport:
        "'{{name}}' is not exported by '{{spec}}'. Odoo's loader returns undefined instead of raising.",
      missingExportFixable: "'{{name}}' is not exported by '{{spec}}'; it is exported by '{{origin}}'.",
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const addonsPath = (options.addonsPath || []).filter((p) => fs.existsSync(p));
    const aliases = new Set([...DEFAULT_ALIASES, ...(options.aliases || [])]);
    const suggestOrigin = options.suggestOrigin !== false;

    if (!addonsPath.length) {
      // Without an addons path there is nothing to resolve against; stay silent rather
      // than reporting every import as broken.
      return {};
    }

    return {
      ImportDeclaration(node) {
        const spec = node.source.value;
        if (typeof spec !== "string" || !spec.startsWith("@") || aliases.has(spec)) {
          return;
        }
        const target = resolveSpecifier(spec, addonsPath);
        if (!target) {
          context.report({ node: node.source, messageId: "unresolvedModule", data: { spec } });
          return;
        }
        const available = exportedNames(target, addonsPath);
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") {
            continue; // default and namespace imports carry no name to verify
          }
          const name = specifier.imported.name;
          if (available.has(name)) {
            continue;
          }
          const origins = suggestOrigin ? findExporters(name, addonsPath) : [];
          // Only rewrite the specifier when this import brings in that name alone.
          // With several names the others may well resolve here, and repointing the
          // whole statement would break them.
          const canFix = origins.length === 1 && node.specifiers.length === 1;
          if (origins.length === 1) {
            const origin = origins[0];
            context.report({
              node: specifier,
              messageId: "missingExportFixable",
              data: { name, spec, origin },
              fix: canFix ? (fixer) => fixer.replaceText(node.source, JSON.stringify(origin)) : null,
            });
          } else {
            context.report({
              node: specifier,
              messageId: "missingExport",
              data: { name, spec },
            });
          }
        }
      },
    };
  },
};
