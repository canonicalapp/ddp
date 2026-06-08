/**
 * Tombstone naming for rename-first sync (see `ddp inspect stale`, `ddp apply --prune`).
 * Diff must not re-rename or re-drop objects that already follow these conventions.
 */

/** Column/table soft-drop: `{name}_dropped_{milliseconds}` */
export const PRESERVED_DROPPED_SUFFIX_PATTERN = /_dropped_\d+$/;

/** Trigger soft-rename backup: `{name}_old_{milliseconds}` */
export const PRESERVED_OLD_TRIGGER_SUFFIX_PATTERN = /_old_\d+$/;

export function isPreservedDroppedArtifactName(name: string): boolean {
  return PRESERVED_DROPPED_SUFFIX_PATTERN.test(name);
}

export function isPreservedOldTriggerName(triggerName: string): boolean {
  return PRESERVED_OLD_TRIGGER_SUFFIX_PATTERN.test(triggerName);
}
