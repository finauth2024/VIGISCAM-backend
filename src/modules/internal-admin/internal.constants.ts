import { MembershipRole } from '@prisma/client';

/**
 * The single VIGISCAM internal tenant (seeded by migration 0010). Internal
 * staff hold their role via a Membership on this tenant.
 */
export const INTERNAL_TENANT_ID = '11111111-1111-4111-8111-111111111111';

/** The roles that may be granted to internal VIGISCAM staff (PDF §7). */
export const INTERNAL_ROLES: MembershipRole[] = [
  MembershipRole.SUPER_ADMIN,
  MembershipRole.REVIEWER,
  MembershipRole.COMPLIANCE_OFFICER,
  MembershipRole.SUPPORT,
];
