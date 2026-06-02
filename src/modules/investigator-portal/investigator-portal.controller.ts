import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { InvestigatorTenantGuard } from '../../common/auth/investigator-tenant.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { AddNoteDto } from './dto/add-note.dto';
import { CloseCaseDto } from './dto/close-case.dto';
import { CreateCaseDto } from './dto/create-case.dto';
import { LinkEntityDto } from './dto/link-entity.dto';
import { ListCasesQueryDto } from './dto/list-cases-query.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { InvestigatorPortalService } from './investigator-portal.service';

@ApiTags('Investigator Console')
@ApiBearerAuth()
@UseGuards(InvestigatorTenantGuard)
@Roles(MembershipRole.INVESTIGATOR, MembershipRole.AGENCY_ANALYST)
@Controller({ path: 'investigator-portal/cases', version: '1' })
export class InvestigatorPortalController {
  constructor(private readonly investigator: InvestigatorPortalService) {}

  @Post()
  @ApiOperation({ summary: 'Open a new investigator case' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCaseDto) {
    return this.investigator.createCase(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List cases for my tenant (filter by status/severity/assignee)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCasesQueryDto) {
    return this.investigator.listCases(user, query);
  }

  @Get(':caseId')
  @ApiOperation({ summary: 'Case detail with linked evidence, clusters, and notes' })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
  ) {
    return this.investigator.getCase(user, caseId);
  }

  @Patch(':caseId')
  @ApiOperation({ summary: 'Update case header fields (use /close for terminal closure)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Body() dto: UpdateCaseDto,
  ) {
    return this.investigator.updateCase(user, caseId, dto);
  }

  @Post(':caseId/evidence')
  @ApiOperation({ summary: 'Link an evidence event id to this case' })
  linkEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Body() dto: LinkEntityDto,
  ) {
    return this.investigator.linkEvidence(user, caseId, dto);
  }

  @Delete(':caseId/evidence/:linkId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unlink an evidence event from this case (records audit event)' })
  async unlinkEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Param('linkId', new ParseUUIDPipe()) linkId: string,
  ) {
    await this.investigator.unlinkEvidence(user, caseId, linkId);
  }

  @Post(':caseId/clusters')
  @ApiOperation({ summary: 'Link a ScamCluster id to this case' })
  linkCluster(
    @CurrentUser() user: AuthenticatedUser,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Body() dto: LinkEntityDto,
  ) {
    return this.investigator.linkCluster(user, caseId, dto);
  }

  @Delete(':caseId/clusters/:linkId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unlink a cluster from this case' })
  async unlinkCluster(
    @CurrentUser() user: AuthenticatedUser,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Param('linkId', new ParseUUIDPipe()) linkId: string,
  ) {
    await this.investigator.unlinkCluster(user, caseId, linkId);
  }

  @Post(':caseId/notes')
  @ApiOperation({ summary: 'Append a note to the case timeline' })
  addNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Body() dto: AddNoteDto,
  ) {
    return this.investigator.addNote(user, caseId, dto);
  }

  @Post(':caseId/close')
  @ApiOperation({ summary: 'Close the case with a final disposition' })
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('caseId', new ParseUUIDPipe()) caseId: string,
    @Body() dto: CloseCaseDto,
  ) {
    return this.investigator.closeCase(user, caseId, dto);
  }
}
