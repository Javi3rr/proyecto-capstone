import { BadRequestException, Controller, Get, ParseBoolPipe, ParseIntPipe, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { esFechaISO } from '../common/montos';
import { instanteSantiago } from '../common/utils';
import { AuditService } from './audit.service';

@Roles('ADMIN')
@Controller('auditoria')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /**
   * GET /api/auditoria?usuarioId=1&accion=ACTUALIZAR&texto=cliente&desde=2026-10-01&hasta=2026-10-31
   *                   &soloEventos=true&soloErrores=false&pagina=1&porPagina=50
   */
  @Get()
  listar(
    @Query('usuarioId', new ParseIntPipe({ optional: true })) usuarioId?: number,
    @Query('accion') accion?: string,
    @Query('texto') texto?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('soloEventos', new ParseBoolPipe({ optional: true })) soloEventos?: boolean,
    @Query('soloErrores', new ParseBoolPipe({ optional: true })) soloErrores?: boolean,
    @Query('pagina', new ParseIntPipe({ optional: true })) pagina?: number,
    @Query('porPagina', new ParseIntPipe({ optional: true })) porPagina?: number,
    // Compatibilidad con la versión anterior (?limite=50)
    @Query('limite', new ParseIntPipe({ optional: true })) limite?: number,
  ) {
    if ((desde && !esFechaISO(desde)) || (hasta && !esFechaISO(hasta))) {
      throw new BadRequestException('Fecha inválida (formato AAAA-MM-DD)');
    }
    return this.audit.listar({
      usuarioId,
      accion: accion?.trim() || undefined,
      texto: texto?.trim().slice(0, 100) || undefined,
      // Días completos en hora de Chile
      desde: desde ? instanteSantiago(desde) : undefined,
      hasta: hasta ? instanteSantiago(hasta, '23:59:59.999') : undefined,
      soloEventos,
      soloErrores,
      pagina,
      porPagina: porPagina ?? limite,
    });
  }

  /** GET /api/auditoria/opciones -> acciones y usuarios para los filtros */
  @Get('opciones')
  opciones() {
    return this.audit.opcionesFiltro();
  }
}
