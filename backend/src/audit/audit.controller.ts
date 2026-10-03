import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from './audit.service';

@Roles('ADMIN')
@Controller('auditoria')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** GET /api/auditoria?usuarioId=1&desde=2026-10-01&hasta=2026-10-31&limite=100 */
  @Get()
  listar(
    @Query('usuarioId', new ParseIntPipe({ optional: true })) usuarioId?: number,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('limite', new ParseIntPipe({ optional: true })) limite?: number,
  ) {
    return this.audit.listar({
      usuarioId,
      desde: desde ? new Date(desde) : undefined,
      hasta: hasta ? new Date(`${hasta}T23:59:59`) : undefined,
      limite,
    });
  }
}
