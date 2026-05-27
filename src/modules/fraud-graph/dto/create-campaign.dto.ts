import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCampaignDto {
  @ApiProperty({ description: 'Human label for the scam campaign.' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  label!: string;

  @ApiProperty({ required: false, description: 'Optional scam category code.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;
}
