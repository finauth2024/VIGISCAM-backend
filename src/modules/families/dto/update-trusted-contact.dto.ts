import { PartialType } from '@nestjs/swagger';
import { CreateTrustedContactDto } from './create-trusted-contact.dto';

export class UpdateTrustedContactDto extends PartialType(CreateTrustedContactDto) {}
