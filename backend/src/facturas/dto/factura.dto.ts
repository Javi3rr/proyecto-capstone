import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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

export class LineaFacturaDto {
  /** Producto del catálogo. Si aún no está registrado, se envía null y se describe en "descripcion" */
  @IsOptional()
  @IsInt()
  productoId?: number | null;

  /** Para productos aún no registrados (no suman stock) */
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  descripcion?: string | null;

  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Cantidad inválida (máx. 3 decimales)' })
  @Min(0.001, { message: 'La cantidad debe ser mayor que 0' })
  @Max(1_000_000)
  cantidad!: number;

  /** Costo unitario neto (sin IVA) */
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Costo inválido (máx. 2 decimales)' })
  @Min(0)
  @Max(100_000_000)
  costoUnitario!: number;
}

export class CrearFacturaDto {
  @IsInt({ message: 'Seleccione el proveedor' })
  proveedorId!: number;

  @Transform(textoLimpio)
  @IsString()
  @IsNotEmpty({ message: 'El N° de factura es obligatorio' })
  @MaxLength(30)
  numero!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida (formato AAAA-MM-DD)' })
  fecha!: string;

  /** Neto escrito a mano: solo se usa si la factura no trae líneas */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 }, { message: 'El neto debe ser un monto entero' })
  @Min(0)
  @Max(10_000_000_000)
  neto?: number;

  /** IVA de la factura. Si no se envía, se calcula como 19 % del neto. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 }, { message: 'El IVA debe ser un monto entero' })
  @Min(0)
  iva?: number;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  observacion?: string | null;

  /** Opcional: la factura puede registrarse solo con su foto y montos */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LineaFacturaDto)
  lineas?: LineaFacturaDto[];
}

export class AnularFacturaDto {
  @Transform(textoLimpio)
  @IsString()
  @IsNotEmpty({ message: 'Debe indicar el motivo de la anulación' })
  @MinLength(5, { message: 'Describa el motivo (mínimo 5 caracteres)' })
  @MaxLength(255)
  motivo!: string;
}
