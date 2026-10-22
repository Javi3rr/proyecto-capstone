import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Matches } from 'class-validator';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DteService } from './dte.service';

class EmitirDiaDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida (formato AAAA-MM-DD)' })
  fecha!: string;
}

/** Guía de despacho electrónica (DTE 52) ante el SII */
@Roles('DESPACHO')
@Controller('dte')
export class DteController {
  constructor(private readonly dte: DteService) {}

  /** GET /api/dte/estado → modo (simulado / pruebas / producción) y si está lista para emitir */
  @Get('estado')
  estado() {
    return this.dte.estado();
  }

  /** POST /api/dte/guias/12/emitir → emite en el SII la guía interna N° 12 */
  @Post('guias/:id/emitir')
  @HttpCode(200)
  emitir(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.dte.emitir(id, user.sub);
  }

  /** POST /api/dte/emitir-dia { "fecha": "2026-10-22" } → emite todas las pendientes del día */
  @Post('emitir-dia')
  @HttpCode(200)
  emitirDia(@Body() dto: EmitirDiaDto, @CurrentUser() user: JwtPayload) {
    return this.dte.emitirDia(dto.fecha, user.sub);
  }

  /** GET /api/dte/guias/12/pdf → PDF oficial con timbre electrónico */
  @Get('guias/:id/pdf')
  async pdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const a = await this.dte.pdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${a.nombre}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(a.ruta, (err) => {
      if (err && !res.headersSent) res.status(404).json({ statusCode: 404, message: 'Archivo no encontrado en el servidor' });
    });
  }
}
