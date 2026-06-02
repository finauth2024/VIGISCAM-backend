import { POLICY_REGISTRY, isKnownPolicyKey } from './policy-registry';

describe('policy registry', () => {
  it('isKnownPolicyKey accepts every registered key', () => {
    for (const key of Object.keys(POLICY_REGISTRY)) {
      expect(isKnownPolicyKey(key)).toBe(true);
    }
  });

  it('isKnownPolicyKey rejects unknown keys', () => {
    expect(isKnownPolicyKey('not-a-policy')).toBe(false);
    expect(isKnownPolicyKey('')).toBe(false);
  });

  describe('elder_mode_default validator', () => {
    const v = POLICY_REGISTRY.elder_mode_default.validate;
    it('accepts booleans', () => {
      expect(v(true)).toBeNull();
      expect(v(false)).toBeNull();
    });
    it('rejects non-booleans', () => {
      expect(v('true')).not.toBeNull();
      expect(v(1)).not.toBeNull();
    });
  });

  describe('guardian_pause_default_seconds validator', () => {
    const v = POLICY_REGISTRY.guardian_pause_default_seconds.validate;
    it('accepts 30..3600 inclusive', () => {
      expect(v(30)).toBeNull();
      expect(v(3_600)).toBeNull();
      expect(v(120)).toBeNull();
    });
    it('rejects out-of-range', () => {
      expect(v(29)).not.toBeNull();
      expect(v(3_601)).not.toBeNull();
      expect(v(-1)).not.toBeNull();
    });
    it('rejects non-integers', () => {
      expect(v(60.5)).not.toBeNull();
      expect(v('60')).not.toBeNull();
    });
  });

  describe('data_retention_days validator', () => {
    const v = POLICY_REGISTRY.data_retention_days.validate;
    it('accepts 30..3650 inclusive', () => {
      expect(v(30)).toBeNull();
      expect(v(3_650)).toBeNull();
    });
    it('rejects out-of-range', () => {
      expect(v(0)).not.toBeNull();
      expect(v(3_651)).not.toBeNull();
    });
  });

  describe('notification_channels_enabled validator', () => {
    const v = POLICY_REGISTRY.notification_channels_enabled.validate;
    it('accepts valid channels', () => {
      expect(v(['EMAIL', 'SMS'])).toBeNull();
      expect(v([])).toBeNull();
    });
    it('rejects unknown channels', () => {
      expect(v(['EMAIL', 'FAX'])).not.toBeNull();
    });
    it('rejects non-arrays', () => {
      expect(v('EMAIL')).not.toBeNull();
    });
  });

  describe('audit_export_allowed_roles validator', () => {
    const v = POLICY_REGISTRY.audit_export_allowed_roles.validate;
    it('accepts arrays of strings (role labels are validated downstream)', () => {
      expect(v(['ENTERPRISE_ADMIN'])).toBeNull();
      expect(v([])).toBeNull();
    });
    it('rejects non-arrays', () => {
      expect(v({})).not.toBeNull();
      expect(v('ENTERPRISE_ADMIN')).not.toBeNull();
    });
  });
});
