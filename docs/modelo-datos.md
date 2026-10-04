# Modelo de datos unificado

> Historia: **[TRANSVERSAL] Diseñar el modelo de datos unificado para soportar despacho e inventario en una sola base de datos**
> Fuente de verdad: `backend/prisma/schema.prisma`

## Diagrama entidad-relación

```mermaid
erDiagram
    USUARIOS ||--o{ AUDITORIA : "genera"

    REPARTIDORES ||--o{ CLIENTES : "atiende"
    CLIENTES ||--o{ DESPACHOS : "recibe"
    JORNADAS_DESPACHO ||--o{ DESPACHOS : "contiene"
    REPARTIDORES ||--o{ DESPACHOS : "lleva"
    DESPACHOS ||--o{ GUIAS : "se respalda en"
    CLIENTES ||--o{ GUIAS : ""
    REPARTIDORES ||--o{ GUIAS : ""
    CLIENTES ||--o{ PAGOS : "realiza"
    GUIAS ||--o{ PAGOS : "se paga con"
    REPARTIDORES ||--o{ PAGOS : "rinde"

    PROVEEDORES ||--o{ FACTURAS : "emite"
    FACTURAS ||--|{ FACTURAS_DETALLE : "contiene"
    PRODUCTOS ||--o{ FACTURAS_DETALLE : ""
    PRODUCTOS ||--o{ MOVIMIENTOS_STOCK : "kardex"
    CONTEOS_INVENTARIO ||--|{ CONTEOS_DETALLE : "contiene"
    PRODUCTOS ||--o{ CONTEOS_DETALLE : ""

    USUARIOS {
        int id PK
        string username UK
        string nombre
        string password_hash
        enum rol "ADMIN | MESON | DESPACHO"
        string codigo UK "codigo de mesonera"
        bool activo
    }
    AUDITORIA {
        bigint id PK
        int usuario_id FK
        string accion
        string recurso
        int estado_http
        json detalle
        datetime creado_en
    }
    REPARTIDORES {
        int id PK
        string nombre
        string rut UK
        string patente
        bool activo
    }
    CLIENTES {
        int id PK
        string nombre
        enum modalidad "REPARTO | PAGO_DIA_SIGUIENTE | PRESENCIAL"
        int repartidor_id FK
        int orden
        decimal precio_kg_especial
        decimal kg_descuento_diario
        bool activo
    }
    PRECIOS_KG {
        int id PK
        decimal valor
        date vigente_desde
    }
    JORNADAS_DESPACHO {
        int id PK
        date fecha UK
        bool cerrada
    }
    DESPACHOS {
        int id PK
        int jornada_id FK
        int cliente_id FK
        int repartidor_id FK
        decimal kg
        int cajas
        decimal precio_kg
        decimal monto
    }
    GUIAS {
        int id PK "N correlativo"
        int despacho_id FK
        date fecha
        decimal kg
        decimal monto
        enum estado "VIGENTE | ANULADA"
        string motivo_anulacion
        int impresiones
    }
    PAGOS {
        int id PK
        int cliente_id FK
        int guia_id FK
        decimal monto
        date fecha
    }
    PRODUCTOS {
        int id PK
        string plu UK "codigo de la balanza"
        string nombre
        enum categoria "PAN | CECINAS | MERCADERIA"
        enum unidad "KG | UNIDAD"
        decimal precio_venta
        decimal stock_minimo
        decimal stock_actual
    }
    PROVEEDORES {
        int id PK
        string rut UK
        string razon_social
    }
    FACTURAS {
        int id PK
        int proveedor_id FK
        string numero
        date fecha
        decimal total
        string archivo_path
        enum estado "VIGENTE | ANULADA"
    }
    FACTURAS_DETALLE {
        int id PK
        int factura_id FK
        int producto_id FK
        decimal cantidad
        decimal costo_unitario
    }
    MOVIMIENTOS_STOCK {
        bigint id PK
        int producto_id FK
        enum tipo
        decimal cantidad "positivo entrada, negativo salida"
        decimal saldo_resultante
        string origen_tipo
        int origen_id
        string codigo_mesonera
    }
    IMPORTACIONES_BALANZA {
        int id PK
        string hash_archivo UK "evita doble importacion"
        datetime periodo_desde
        datetime periodo_hasta
    }
    CONTEOS_INVENTARIO {
        int id PK
        datetime fecha
    }
    CONTEOS_DETALLE {
        int id PK
        decimal stock_esperado
        decimal stock_contado
        decimal diferencia
    }
    CIERRES_CAJA {
        int id PK
        date fecha UK
        decimal total_caja
    }
```

## Reglas de negocio reflejadas en el modelo

| Regla | Cómo se cumple |
|---|---|
| Replicar las secciones del cuaderno | `clientes.modalidad` + `clientes.repartidor_id` + `clientes.orden` |
| "Pago día siguiente" se cobra con el Repartidor 2 | Esos clientes quedan asociados al Repartidor 2; el cuadre suma sus despachos del día anterior |
| Una línea por cliente y día | `UNIQUE(jornada_id, cliente_id)` en `despachos` |
| Cerrar el día bloquea la edición | `jornadas_despacho.cerrada` |
| Precio especial por cliente | `clientes.precio_kg_especial` (null = precio general vigente) |
| Kg no cobrados cada día (ej. Suegra: 1 kg) | `clientes.kg_descuento_diario` → monto = (kg − descuento) × precio |
| Un cambio de precio no altera guías emitidas | `precio_kg` se copia en `despachos` y `guias` al momento de emitir |
| Guía y factura no se editan, solo se anulan | `estado` + `motivo_anulacion` (+ quién y cuándo) |
| Factura sin duplicados | `UNIQUE(proveedor_id, numero)` |
| Cruce con balanzas | `productos.plu` único, igual al código de la balanza |
| No importar dos veces el mismo archivo | `importaciones_balanza.hash_archivo` único |
| Trazabilidad del stock (robo hormiga) | `movimientos_stock` es inmutable y guarda origen, usuario y código de mesonera |
| Kg y montos exactos | `DECIMAL(10,3)` para kg y `DECIMAL(12,2)` para montos (nunca `float`) |
| Eliminación lógica | Campo `activo` en usuarios, clientes, repartidores, productos y proveedores |
| Trazabilidad general | Tabla `auditoria` + campos `creado_por_id` / `creado_en` |

## Datos iniciales (seed)

**Precios (cargados solo la primera vez):** precio general **$2.000/kg**. Condiciones especiales: **Suegra** $1.700/kg con 1 kg de descuento diario, **Amasandería** $1.900/kg, **Laguna** y **Maritza** $1.800/kg.

El archivo `backend/prisma/seed.js` carga automáticamente, y sin duplicar si se vuelve a ejecutar:

- **Usuarios:** `admin / adminpatopan`, `meson / mesonpatopan`, `despachador / despachadorpatopan`
- **Repartidores:** Repartidor 1 y Repartidor 2
- **40 clientes del cuaderno**, en el mismo orden y con su modalidad:
  - Pago día siguiente (7): Pilar, Mary, Suegra, Santa, Santillana, Drake, Lorena
  - Repartidor 1 (14): Isla, Margarita, Amasandería, Laguna, Maritza, Domingo, Julio, Anita, Elvin, Picaflor, Varas, Copec, Oficina, Sanguchera
  - Repartidor 2 (13): Monte, Jumbito, Pedro Gallo, Nuevo2, Aguila, Dania, Lebreles, Tucson, Horacio, Tutin, Aguila2, Andrés, Valentina
  - Presenciales (6): Santa Elena, Señora María, Luis Soto, Eliana, Leo, Varas2
