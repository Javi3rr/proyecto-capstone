import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ModalidadCliente } from '@prisma/client';
import { textoLimpio } from '../../common/utils';

export class EmitirGuiaDto {
  @IsInt()
  despachoId!: number;
}

/** Emite de una vez las guías pendientes de un día (opcionalmente solo de un grupo) */
export class EmitirLoteDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inválida (formato AAAA-MM-DD)' })
  fecha!: string;

  @IsOptional()
  @IsEnum(ModalidadCliente)
  modalidad?: ModalidadCliente;

  @IsOptional()
  @IsInt()
  repartidorId?: number;

  /** 1 = mañana, 2 = tarde 1, 3 = tarde 2 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  vuelta?: number;
}

export class ImprimirGuiasDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  ids!: number[];
}

export class AnularGuiaDto {
  @Transform(textoLimpio)
  @IsString()
  @IsNotEmpty({ message: 'Debe indicar el motivo de la anulación' })
  @MinLength(5, { message: 'Describa el motivo (mínimo 5 caracteres)' })
  @MaxLength(255)
  motivo!: string;
}
