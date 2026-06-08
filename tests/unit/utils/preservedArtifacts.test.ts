import {
  isPreservedDroppedArtifactName,
  isPreservedOldTriggerName,
} from '@/utils/preservedArtifacts';

describe('preservedArtifacts', () => {
  describe('isPreservedDroppedArtifactName', () => {
    it('matches column/table tombstones ending in _dropped_<digits>', () => {
      expect(isPreservedDroppedArtifactName('name_dropped_1778247438295')).toBe(
        true
      );
      expect(
        isPreservedDroppedArtifactName(
          'name_dropped_1778247438295_dropped_1778666769493'
        )
      ).toBe(true);
    });

    it('does not match live column names', () => {
      expect(isPreservedDroppedArtifactName('name')).toBe(false);
      expect(isPreservedDroppedArtifactName('old_column')).toBe(false);
      expect(isPreservedDroppedArtifactName('name_dropped')).toBe(false);
      expect(isPreservedDroppedArtifactName('name_dropped_abc')).toBe(false);
    });
  });

  describe('isPreservedOldTriggerName', () => {
    it('matches trigger rename backups ending in _old_<digits>', () => {
      expect(isPreservedOldTriggerName('trg_users_old_1778152978900')).toBe(
        true
      );
    });

    it('does not match live trigger names', () => {
      expect(isPreservedOldTriggerName('trg_users_set_updated_at')).toBe(false);
      expect(isPreservedOldTriggerName('trg_old_users')).toBe(false);
    });
  });
});
