import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { JwtPayload } from '../common/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { esFechaISO } from '../common/montos';
import { AnularFacturaDto, CrearFacturaDto } from './dto/factura.dto';
import { ArchivoSubido, FacturasService, MAX_ARCHIVO_BYTES } from './facturas.service';

@Roles('MESON')
@Controller('facturas')
export class FacturasController {
  constructor(private readonly facturas: FacturasService) {}

  /** GET /api/facturas?desde=2026-10-01&hasta=2026-10-31&proveedorId=2&numero=123&incluirAnuladas=true */
  @Get()
  listar(
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('proveedorId', new ParseIntPipe({ optional: true })) proveedorId?: number,
    @Query('numero') numero?: string,
    @Query('incluirAnuladas', new ParseBoolPipe({ optional: true })) incluirAnuladas?: boolean,
  ) {
    if ((desde && !esFechaISO(desde)) || (hasta && !esFechaISO(hasta))) {
      throw new BadRequestException('Fecha inválida (formato AAAA-MM-DD)');
    }
    return this.facturas.listar({ desde, hasta, proveedorId, numero: numero?.trim().slice(0, 30), incluirAnuladas });
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.facturas.obtener(id);
  }

  /** Registra la factura y suma su mercadería al stock */
  @Post()
  crear(@Body() dto: CrearFacturaDto, @CurrentUser() user: JwtPayload) {
    return this.facturas.crear(dto, user.sub);
  }

  /** Anula con motivo y descuenta del stock lo que la factura había sumado */
  @Post(':id/anular')
  @HttpCode(200)
  anular(@Param('id', ParseIntPipe) id: number, @Body() dto: AnularFacturaDto, @CurrentUser() user: JwtPayload) {
    return this.facturas.anular(id, dto.motivo, user.sub);
  }

  /** POST /api/facturas/5/archivo  (multipart, campo "archivo": PDF, JPG, PNG o WEBP, máx. 10 MB) */
  @Post(':id/archivo')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_ARCHIVO_BYTES, files: 1 } }))
  adjuntar(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() archivo: ArchivoSubido | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.facturas.adjuntar(id, archivo, user.sub);
  }

  /** GET /api/facturas/5/archivo -> muestra la foto o PDF en el navegador */
  @Get(':id/archivo')
  async verArchivo(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const a = await this.facturas.archivo(id);
    res.setHeader('Content-Type', a.tipo);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.nombre)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(a.ruta, (err) => {
      if (err && !res.headersSent) res.status(404).json({ statusCode: 404, message: 'Archivo no encontrado en el servidor' });
    });
  }
}
