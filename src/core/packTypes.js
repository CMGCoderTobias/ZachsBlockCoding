/**
 * Pack API (v1)
 *
 * A "pack" contributes blocks + generators for one or more languages.
 *
 * For now we ship built-in packs (loaded from /src/packs/*). Later we’ll load
 * community packs from disk/node_modules with a registry + manifest.
 */

export function definePack(def) {
  return def;
}

