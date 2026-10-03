import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/** Convierte "30m", "12h", "7d" o "3600" a segundos */
function duracionASegundos(valor: string): number {
  const m = /^(\d+)\s*([smhd]?)$/.exec(valor.trim());
  if (!m) return 12 * 3600;
  const n = Number(m[1]);
  const factor: Record<string, number> = { '': 1, s: 1, m: 60, h: 3600, d: 86400 };
  return n * factor[m[2]];
}

@Module({
  imports: [
    // global: true -> JwtService queda disponible para el guard global (JwtAuthGuard)
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: duracionASegundos(config.get<string>('JWT_EXPIRES_IN') ?? '12h') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
