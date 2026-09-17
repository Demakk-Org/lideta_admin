import {
  FEATURES,
  FEATURE_KEYS,
  getFeature,
  isFeatureKey,
  type FeatureKey,
} from '@/lib/featureKeys';

/** The `features` map as stored: anything can be in there. */
export type RawFeatures = Record<string, unknown>;

/** Pending, unsaved toggles. Holds only values that differ from what's stored. */
export type FeatureEdits = Partial<Record<FeatureKey, boolean>>;

export type FeatureChange = { from: boolean | null; to: boolean | null };

/** Mirrors the app: a missing or non-boolean value counts as off. */
export function isOn(raw: RawFeatures, key: string): boolean {
  return raw[key] === true;
}

/** Stored values with the pending edits laid over them. */
export function mergeFeatures(raw: RawFeatures, edits: FeatureEdits): RawFeatures {
  return { ...raw, ...edits };
}

/**
 * Records a toggle. Setting a feature back to what is stored drops the edit,
 * so flipping a switch twice leaves nothing to save.
 */
export function applyToggle(
  raw: RawFeatures,
  edits: FeatureEdits,
  key: FeatureKey,
  value: boolean,
): FeatureEdits {
  const next = { ...edits };
  if (isOn(raw, key) === value) delete next[key];
  else next[key] = value;
  return next;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/**
 * Keys whose stored value differs between two `features` maps. Missing and
 * non-boolean values are reported as `null`, since Firestore can't hold
 * `undefined` in the audit log.
 */
export function diffFeatures(
  before: RawFeatures,
  after: RawFeatures,
): Record<string, FeatureChange> {
  const changed: Record<string, FeatureChange> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of [...keys].sort()) {
    if (before[key] === after[key]) continue;
    changed[key] = { from: asBoolean(before[key]), to: asBoolean(after[key]) };
  }
  return changed;
}

/** Everything `key` needs, directly or through another feature. */
export function requiredFeatures(key: FeatureKey): FeatureKey[] {
  const seen = new Set<FeatureKey>();
  const visit = (k: FeatureKey) => {
    for (const dep of getFeature(k).dependsOn) {
      if (!isFeatureKey(dep) || seen.has(dep)) continue;
      seen.add(dep);
      visit(dep);
    }
  };
  visit(key);
  return FEATURE_KEYS.filter((k) => seen.has(k));
}

/** Everything that needs `key`, directly or through another feature. */
export function dependentFeatures(key: FeatureKey): FeatureKey[] {
  return FEATURE_KEYS.filter((k) => requiredFeatures(k).includes(key));
}

/** Features that must be turned on before `key` can be. Empty means allowed. */
export function missingDependencies(
  key: FeatureKey,
  features: RawFeatures,
): FeatureKey[] {
  return requiredFeatures(key).filter((dep) => !isOn(features, dep));
}

/** Features that are on and would break if `key` were turned off. */
export function enabledDependents(
  key: FeatureKey,
  features: RawFeatures,
): FeatureKey[] {
  return dependentFeatures(key).filter((dep) => isOn(features, dep));
}

/**
 * Features that are on while something they need is off. The page blocks
 * creating these, but they can still arrive from Firestore or from choosing
 * to switch a feature off without its dependents.
 */
export function dependencyViolations(
  features: RawFeatures,
): Array<{ key: FeatureKey; missing: FeatureKey[] }> {
  return FEATURE_KEYS.filter((key) => isOn(features, key))
    .map((key) => ({ key, missing: missingDependencies(key, features) }))
    .filter((v) => v.missing.length > 0);
}

/** Keys stored in Firestore that this dashboard doesn't know about. */
export function unknownFeatureKeys(raw: RawFeatures): string[] {
  return Object.keys(raw).filter((k) => !isFeatureKey(k)).sort();
}

/** Known keys with no stored boolean; the app treats these as off. */
export function unsetFeatureKeys(raw: RawFeatures): FeatureKey[] {
  return FEATURES.map((f) => f.key).filter(
    (k) => typeof raw[k] !== 'boolean',
  );
}

export type VersionStatus = 'draft' | 'published' | 'archived';

/**
 * Only drafts can be edited or deleted. Published and archived versions are
 * frozen, so the history of what users actually got stays true.
 */
export function canEditVersion(status: VersionStatus): boolean {
  return status === 'draft';
}

/** A draft goes live; an archived version is published again as a rollback. */
export function canPublishVersion(status: VersionStatus): boolean {
  return status === 'draft' || status === 'archived';
}

/** The next version number: one past the highest that exists. */
export function nextVersionNumber(versions: ReadonlyArray<{ version: number }>): number {
  return versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
}

/**
 * Which version the page opens on: the newest draft (work in progress), else
 * the published one, else the newest. Null when there are no versions.
 */
export function defaultSelectedVersion(
  versions: ReadonlyArray<{ version: number; status: VersionStatus }>,
): number | null {
  const newestFirst = [...versions].sort((a, b) => b.version - a.version);
  return (
    newestFirst.find((v) => v.status === 'draft')?.version ??
    newestFirst.find((v) => v.status === 'published')?.version ??
    newestFirst[0]?.version ??
    null
  );
}
