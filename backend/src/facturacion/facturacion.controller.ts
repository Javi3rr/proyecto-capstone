import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DteService } from '../dte/dte.service';
import { AnularFacturaMensualDto, GenerarFacturasDto } from './dto/facturacion.dto';
import { FacturacionService } from './facturacion.service';

function validarMes(mes: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new BadRequestException('Mes inválido (formato AAAA-MM)');
  return mes;
}

/** Facturación mensual: factura electrónica (DTE 33) por las guías del mes de cada cliente */
@Roles('DESPACHO')
@Controller('facturacion')
export class FacturacionController {
  constructor(
    private readonly facturacion: FacturacionService,
    private readonly dte: DteService,
  ) {}

  /** GET /api/facturacion/meses/2026-10 → una fila por cliente: guías del mes, neto, IVA, total y su factura */
  @Get('meses/:mes')
  resumen(@Param('mes') mes: string) {
    return this.facturacion.resumen(validarMes(mes));
  }

  /** POST /api/facturacion/meses/2026-10/generar { "clienteId": 5 } → una factura; sin clienteId → todas las pendientes */
  @Post('meses/:mes/generar')
  async generar(@Param('mes') mes: string, @Body() dto: GenerarFacturasDto, @CurrentUser() user: JwtPayload) {
    validarMes(mes);
    if (dto.clienteId) {
      const f = await this.facturacion.generar(mes, dto.clienteId, user.sub);
      return { creadas: [f.id], errores: [] };
    }
    return this.facturacion.generarTodas(mes, user.sub);
  }

  /** POST /api/facturacion/meses/2026-10/emitir → emite en el SII las facturas del mes que aún no tienen folio */
  @Post('meses/:mes/emitir')
  @HttpCode(200)
  emitirMes(@Param('mes') mes: string, @CurrentUser() user: JwtPayload) {
    return this.dte.emitirFacturasMes(validarMes(mes), user.sub);
  }

  @Get('facturas/:id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.facturacion.obtener(id);
  }

  @Post('facturas/:id/emitir')
  @HttpCode(200)
  emitir(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.dte.emitirFactura(id, user.sub);
  }

  @Post('facturas/:id/anular')
  @HttpCode(200)
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularFacturaMensualDto, @CurrentUser() user: JwtPayload) {
    return this.facturacion.anular(id, dto.motivo, user.sub);
  }

  /** GET /api/facturacion/facturas/3/pdf → PDF oficial con timbre electrónico */
  @Get('facturas/:id/pdf')
  async pdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const a = await this.dte.pdfFactura(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${a.nombre}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(a.ruta, (err) => {
      if (err && !res.headersSent) res.status(404).json({ statusCode: 404, message: 'Archivo no encontrado en el servidor' });
    });
  }
}
