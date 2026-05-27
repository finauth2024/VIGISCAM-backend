import { Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { RuleSuggestionService } from './rule-suggestion.service';

/**
 * Detection-rule suggestion engine (PDF §33). Triggers a generation pass that
 * scans verified-intelligence clusters and lands new suggestions as DRAFT
 * rules — never as ACTIVE. Internal-only.
 */
@ApiTags('Detection Rule Suggestions (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/rule-suggestions', version: '1' })
export class RuleSuggestionController {
  constructor(private readonly suggestions: RuleSuggestionService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Generate DRAFT rule suggestions from verified-intelligence clusters. Always DRAFT — never auto-activates.',
  })
  generate(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.suggestions.generateSuggestions(user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('generate-phrase-rules')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Phase 6F — generate DRAFT PHRASE_MATCH suggestions from NLP-classified verified signals. Always DRAFT — never auto-activates.',
  })
  generatePhraseRules(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.suggestions.generatePhraseRuleSuggestions(user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
