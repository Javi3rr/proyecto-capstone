import { CategoriaProducto, UnidadMedida } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Fila tal como viene del Excel (ya asignadas las columnas); se valida en el servicio para informar errores por fila */
export class FilaProductoDto {
  @IsInt()
  fila!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  plu?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string | null;

  @IsOptional()
  @IsNumber()
  precioVenta?: number | null;

  /** Texto libre del Excel: "kg", "peso", "unidad", "un", "pza"… */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  unidad?: string | null;

  /** Texto libre: "pan", "cecinas", "mercadería"… */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  categoria?: string | null;
}

/** Fila del ScannerMap: PLU y su código de barras */
export class FilaBarrasDto {
  @IsInt()
  fila!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  plu?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigo?: string | null;
}

export class ImportarBarrasDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'El archivo no tiene filas' })
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => FilaBarrasDto)
  filas!: FilaBarrasDto[];

  @IsBoolean()
  simular!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nombreArchivo?: string;
}

export class ImportarProductosDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'El archivo no tiene filas' })
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => FilaProductoDto)
  filas!: FilaProductoDto[];

  @IsEnum(CategoriaProducto)
  categoriaPorDefecto!: CategoriaProducto;

  /** Si el archivo no trae categoría: deducirla por nombre y tipo (pan / cecinas al peso / mercadería) */
  @IsOptional()
  @IsBoolean()
  categoriaAutomatica?: boolean;

  @IsEnum(UnidadMedida)
  unidadPorDefecto!: UnidadMedida;

  /** true = solo revisar (no guarda nada) */
  @IsBoolean()
  simular!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nombreArchivo?: string;
}
