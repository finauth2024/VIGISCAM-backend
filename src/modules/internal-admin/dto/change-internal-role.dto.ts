import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { InternalRole } from './grant-internal-role.dto';

/** Changes the role of an existing internal staff membership. */
export class ChangeInternalRoleDto {
  @ApiProperty({ enum: InternalRole, description: 'The new internal role.' })
  @IsEnum(InternalRole)
  role!: InternalRole;
}
