import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { textoLimpio } from '../../common/utils';

export class GenerarFacturasDto {
  /** Cliente a facturar. Si no se indica, se generan las de todos los clientes con guías sin facturar */
  @IsOptional()
  @IsInt()
  @Min(1)
  clienteId?: number;
}

export class AnularFacturaMensualDto {
  @Transform(textoLimpio)
  @IsString()
  @IsNotEmpty({ message: 'Debe indicar el motivo de la anulación' })
  @MinLength(5, { message: 'Describa el motivo (mínimo 5 caracteres)' })
  @MaxLength(255)
  motivo!: string;
}
