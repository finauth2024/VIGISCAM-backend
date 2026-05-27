import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddCampaignMemberDto {
  @ApiProperty({ format: 'uuid', description: 'The INDICATOR node id to attach to this campaign.' })
  @IsUUID()
  nodeId!: string;
}
