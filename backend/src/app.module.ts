import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClientesModule } from './clientes/clientes.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { HealthController } from './health/health.controller';
import { EntregaModule } from './entrega/entrega.module';
import { FacturasModule } from './facturas/facturas.module';
import { GuiasModule } from './guias/guias.module';
import { InventarioModule } from './inventario/inventario.module';
import { MantencionModule } from './mantencion/mantencion.module';
import { PlanillaModule } from './planilla/planilla.module';
import { PreciosModule } from './precios/precios.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductosModule } from './productos/productos.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { RepartidoresModule } from './repartidores/repartidores.module';
import { ReportesModule } from './reportes/reportes.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { VentasModule } from './ventas/ventas.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    ClientesModule,
    RepartidoresModule,
    PreciosModule,
    PlanillaModule,
    GuiasModule,
    EntregaModule,
    MantencionModule,
    ReportesModule,
    ProductosModule,
    ProveedoresModule,
    FacturasModule,
    InventarioModule,
    UsuariosModule,
    VentasModule,
  ],
  controllers: [HealthController],
  providers: [
    // Orden: primero se valida el token, luego el rol
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Registra en auditoría toda operación que modifica datos
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
