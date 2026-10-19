import { CategoriaProducto, UnidadMedida } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { textoLimpio } from '../../common/utils';

export class CrearProductoDto {
  /** Código PLU: el mismo que tiene el producto en la balanza etiquetadora */
  @Transform(textoLimpio)
  @IsString()
  @IsNotEmpty({ message: 'El código PLU es obligatorio' })
  @Matches(/^[0-9A-Za-z-]{1,20}$/, { message: 'El PLU solo admite números, letras y guion (máx. 20)' })
  plu!: string;

  @Transform(textoLimpio)
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(120)
  nombre!: string;

  @IsEnum(CategoriaProducto, { message: 'Categoría inválida (PAN, CECINAS o MERCADERIA)' })
  categoria!: CategoriaProducto;

  @IsEnum(UnidadMedida, { message: 'Unidad inválida (KG o UNIDAD)' })
  unidad!: UnidadMedida;

  @IsNumber({ maxDecimalPlaces: 0 }, { message: 'El precio debe ser un número entero de pesos' })
  @Min(0)
  @Max(10_000_000)
  precioVenta!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'Stock mínimo inválido (máx. 3 decimales)' })
  @Min(0)
  @Max(1_000_000)
  stockMinimo?: number;

  /** Código de barras (opcional, solo dígitos) */
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @Matches(/^\d{6,20}$/, { message: 'El código de barras debe tener entre 6 y 20 dígitos' })
  codigoBarras?: string | null;
}

export class ActualizarProductoDto {
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @Matches(/^[0-9A-Za-z-]{1,20}$/, { message: 'El PLU solo admite números, letras y guion (máx. 20)' })
  plu?: string;

  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede quedar vacío' })
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsEnum(CategoriaProducto)
  categoria?: CategoriaProducto;

  @IsOptional()
  @IsEnum(UnidadMedida)
  unidad?: UnidadMedida;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 }, { message: 'El precio debe ser un número entero de pesos' })
  @Min(0)
  @Max(10_000_000)
  precioVenta?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1_000_000)
  stockMinimo?: number;


  /** Código de barras (opcional, solo dígitos) */
  @Transform(textoLimpio)
  @IsOptional()
  @IsString()
  @Matches(/^\d{6,20}$/, { message: 'El código de barras debe tener entre 6 y 20 dígitos' })
  codigoBarras?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
