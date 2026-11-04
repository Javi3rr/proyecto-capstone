import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { textoLimpio } from '../../common/utils';

export class GenerarFacturasDto {
  /** Cliente a facturar. Si no se indica, se generan las de todos los clientes con guías sin facturar.
   *  null no cuenta como "no indicado" (evita generar todas por un error del cliente HTTP). */
  @ValidateIf((o: GenerarFacturasDto) => o.clienteId !== undefined)
  @IsInt({ message: 'clienteId debe ser un número entero' })
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
