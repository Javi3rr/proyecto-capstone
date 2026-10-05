import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { textoLimpio } from '../../common/utils';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Línea del archivo de ventas (columnas ya asignadas en pantalla) */
export class LineaArchivoDto {
  @IsInt()
  fila!: number;

  @IsOptional()
  @IsString()
  fecha?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  plu?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string | null;

  @IsOptional()
  @IsNumber()
  cantidad?: number | null;

  @IsOptional()
  @IsNumber()
  monto?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  mesonera?: string | null;
}

export class ImportarVentasDto {
  @IsString()
  @MaxLength(255)
  nombreArchivo!: string;

  /** Fecha a usar si el archivo no trae columna de fecha */
  @IsOptional()
  @Matches(FECHA, { message: 'Fecha inválida (AAAA-MM-DD)' })
  fechaPorDefecto?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'El archivo no tiene filas' })
  @ArrayMaxSize(50000)
  @ValidateNested({ each: true })
  @Type(() => LineaArchivoDto)
  lineas!: LineaArchivoDto[];

  /** true = solo revisar (no guarda nada) */
  @IsBoolean()
  simular!: boolean;
}

export class LineaManualDto {
  @IsInt()
  productoId!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001, { message: 'La cantidad debe ser mayor que 0' })
  @Max(1_000_000)
  cantidad!: number;

  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(100_000_000)
  monto!: number;
}

export class MesoneraManualDto {
  @Transform(textoLimpio)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  codigo!: string;

  /** Total vendido por la mesonera en el día */
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  monto!: number;

  /** Lo que vendió como "Misc. Por Conteo" */
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  montoMisc!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  tickets?: number | null;
}

export class CierreManualDto {
  @Matches(FECHA, { message: 'Fecha inválida (AAAA-MM-DD)' })
  fecha!: string;

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => LineaManualDto)
  lineas!: LineaManualDto[];

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MesoneraManualDto)
  mesoneras!: MesoneraManualDto[];

  /** Total "Misc." del día cuando no se detalla por mesonera */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  montoMisc?: number;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  observacion?: string | null;
}

export class AnularImportacionDto {
  @Transform(textoLimpio)
  @IsString()
  @IsNotEmpty({ message: 'Debe indicar el motivo' })
  @MinLength(5, { message: 'Describa el motivo (mínimo 5 caracteres)' })
  @MaxLength(255)
  motivo!: string;
}
