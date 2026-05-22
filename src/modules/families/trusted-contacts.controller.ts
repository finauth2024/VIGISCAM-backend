import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CreateTrustedContactDto } from './dto/create-trusted-contact.dto';
import { UpdateTrustedContactDto } from './dto/update-trusted-contact.dto';
import { TrustedContactsService } from './trusted-contacts.service';

@ApiTags('Trusted Contacts')
@ApiBearerAuth()
@Controller({ path: 'trusted-contacts', version: '1' })
export class TrustedContactsController {
  constructor(private readonly trustedContacts: TrustedContactsService) {}

  @Post()
  @ApiOperation({ summary: 'Add a trusted contact' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTrustedContactDto) {
    return this.trustedContacts.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my trusted contacts' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.trustedContacts.list(user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a trusted contact' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTrustedContactDto,
  ) {
    return this.trustedContacts.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a trusted contact' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.trustedContacts.remove(user, id);
  }
}
