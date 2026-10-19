import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { textoLimpio } from '../../common/utils';

/** Motivos permitidos para una diferencia de inventario */
export const MOTIVOS_AJUSTE = ['MERMA', 'VENCIMIENTO', 'PERDIDA', 'ERROR_REGISTRO', 'OTRO'] as const;
export type MotivoAjuste = (typeof MOTIVOS_AJUSTE)[number];

export class LineaConteoDto {
  @IsInt()
  productoId!: number;

  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Cantidad contada inválida (máx. 3 decimales)' })
  @Min(0, { message: 'La cantidad contada no puede ser negativa' })
  @Max(1_000_000)
  stockContado!: number;

  /** Obligatorio cuando lo contado no coincide con el stock del sistema */
  @IsOptional()
  @IsIn(MOTIVOS_AJUSTE, { message: 'Motivo inválido' })
  motivo?: MotivoAjuste;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  detalle?: string | null;
}

export class CrearConteoDto {
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  observacion?: string | null;

  @IsArray()
  @ArrayMinSize(1, { message: 'Cuente al menos un producto' })
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => LineaConteoDto)
  lineas!: LineaConteoDto[];
}
