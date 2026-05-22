import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class RequestGuardianshipDto {
  @ApiProperty({
    example: 'parent@example.com',
    description: 'Email of the VIGISCAM account you are asking to protect.',
  })
  @IsEmail()
  protectedUserEmail!: string;
}
