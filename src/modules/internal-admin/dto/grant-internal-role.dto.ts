import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, MaxLength } from 'class-validator';

/** The roles assignable to internal VIGISCAM staff (a subset of MembershipRole). */
export enum InternalRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  REVIEWER = 'REVIEWER',
  COMPLIANCE_OFFICER = 'COMPLIANCE_OFFICER',
  SUPPORT = 'SUPPORT',
}

/**
 * Grants an internal staff role to an existing VIGISCAM account. The person
 * must already have registered an account — this only assigns the role.
 */
export class GrantInternalRoleDto {
  @ApiProperty({ description: 'Email of the existing account to make internal staff.' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ enum: InternalRole, description: 'The internal role to grant.' })
  @IsEnum(InternalRole)
  role!: InternalRole;
}
