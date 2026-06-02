/**
 * Closed registry of enterprise policy keys + their value shapes.
 *
 * Why a static registry instead of a DB enum?
 *  - Adding a new policy must not require a Prisma migration.
 *  - The registry maps a key to a JSON-schema-style validator the
 *    service runs against the value before persisting. Unknown keys
 *    are rejected at the DTO layer.
 *
 * The shape of each policy value is documented inline so a future
 * UI can render the right form control per policy.
 */

export type EnterprisePolicyKey =
  | 'elder_mode_default'
  | 'guardian_pause_default_seconds'
  | 'continue_anyway_disabled'
  | 'trusted_contact_review_required_at_critical'
  | 'data_retention_days'
  | 'evidence_legal_hold_default'
  | 'notification_channels_enabled'
  | 'audit_export_allowed_roles';

export interface EnterprisePolicyDefinition {
  key: EnterprisePolicyKey;
  description: string;
  validate(value: unknown): string | null; // null on success, error string on failure
}

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isPosInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isStringArr = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

export const POLICY_REGISTRY: Record<EnterprisePolicyKey, EnterprisePolicyDefinition> = {
  elder_mode_default: {
    key: 'elder_mode_default',
    description: 'Default Elder Mode setting for new users in this enterprise.',
    validate: (v) => (isBool(v) ? null : 'must be a boolean'),
  },
  guardian_pause_default_seconds: {
    key: 'guardian_pause_default_seconds',
    description: 'Default Guardian Pause countdown duration (seconds).',
    validate: (v) =>
      isPosInt(v) && v >= 30 && v <= 3_600
        ? null
        : 'must be an integer between 30 and 3600 seconds',
  },
  continue_anyway_disabled: {
    key: 'continue_anyway_disabled',
    description:
      'When true, all users in this enterprise have the "Continue Anyway" override hidden.',
    validate: (v) => (isBool(v) ? null : 'must be a boolean'),
  },
  trusted_contact_review_required_at_critical: {
    key: 'trusted_contact_review_required_at_critical',
    description:
      'When true, CRITICAL-risk events must wait for a trusted-contact review even if the user attempts to proceed.',
    validate: (v) => (isBool(v) ? null : 'must be a boolean'),
  },
  data_retention_days: {
    key: 'data_retention_days',
    description: 'Default retention for evidence files in this tenant (days).',
    validate: (v) =>
      isPosInt(v) && v >= 30 && v <= 3_650 ? null : 'must be an integer between 30 and 3650 days',
  },
  evidence_legal_hold_default: {
    key: 'evidence_legal_hold_default',
    description: 'When true, every new evidence file is created with legal hold engaged.',
    validate: (v) => (isBool(v) ? null : 'must be a boolean'),
  },
  notification_channels_enabled: {
    key: 'notification_channels_enabled',
    description:
      'Allow-list of notification channels usable in this enterprise (EMAIL, SMS, PUSH, IN_APP, WEBSOCKET).',
    validate: (v) => {
      if (!isStringArr(v)) return 'must be an array of channel names';
      const allowed = new Set(['EMAIL', 'SMS', 'PUSH', 'IN_APP', 'WEBSOCKET']);
      for (const x of v) {
        if (!allowed.has(x)) return `unknown channel "${x}"`;
      }
      return null;
    },
  },
  audit_export_allowed_roles: {
    key: 'audit_export_allowed_roles',
    description: 'Membership roles permitted to export audit logs (defaults to ENTERPRISE_ADMIN).',
    validate: (v) => (isStringArr(v) ? null : 'must be an array of role names'),
  },
};

export const KNOWN_POLICY_KEYS = Object.keys(POLICY_REGISTRY) as EnterprisePolicyKey[];

export function isKnownPolicyKey(k: string): k is EnterprisePolicyKey {
  return k in POLICY_REGISTRY;
}
