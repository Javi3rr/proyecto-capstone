# Panadería Patopan · Sistema web unificado

Proyecto de título (Capstone). Es un sistema web para la Panadería Patopan con dos secciones:

- **Despacho:** registro digital del pan que sale con los repartidores, guías impresas por caja, cuadre automático por repartidor y gestión de clientes.
- **Mesón:** registro de facturas de mercadería, inventario y trazabilidad del stock, integrado con las balanzas etiquetadoras.

| Capa | Tecnología |
|---|---|
| Frontend | Angular 19 + Nginx |
| Backend | NestJS 11 (Node.js 22, TypeScript) + Prisma 6 |
| Base de datos | PostgreSQL 16 |
| Contenedores | Docker Compose |

Documentación: [Arquitectura](docs/arquitectura.md) · [Modelo de datos](docs/modelo-datos.md)

---

## 1. Requisitos

- **Docker Desktop** (con Docker Compose v2), encendido.
- **Visual Studio Code** (al abrir la carpeta recomendará las extensiones útiles).
- *Opcional, para desarrollar sin reconstruir contenedores:* **Node.js 22 LTS**.

## 2. Empezar desde cero: eliminar contenedores anteriores

> ⚠️ Esto borra contenedores **y sus datos**. Revisa la lista antes de eliminar, por si tienes contenedores de otros proyectos.

**Si los contenedores antiguos se crearon con un `docker-compose.yml`**, abre una terminal en *esa* carpeta antigua y ejecuta:

```bash
docker compose down -v --rmi local
```

**Si no recuerdas cómo se crearon**, elimínalos uno por uno:

```bash
docker ps -a                      # lista todos los contenedores (NOMBRE en la última columna)
docker rm -f <nombre_o_id>        # elimina el contenedor (repetir por cada uno)

docker volume ls                  # lista los volúmenes (aquí quedan los datos de las BD)
docker volume rm <nombre_volumen> # elimina el volumen

docker image ls                   # opcional: lista imágenes
docker image rm <imagen>          # opcional: libera espacio
```

Solo como último recurso, y **únicamente si no tienes nada más en Docker**: `docker system prune -a --volumes` borra todo lo que no esté en uso.

## 3. Levantar el proyecto

```bash
# 1) En la carpeta del proyecto, crea tu archivo de variables
cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env
#    -> edita .env y cambia POSTGRES_PASSWORD y JWT_SECRET

# 2) Construye y levanta todo
docker compose up -d --build

# 3) Revisa que todo esté "healthy"
docker compose ps
docker compose logs -f api      # Ctrl + C para salir de los logs
```

La primera vez tarda algunos minutos, porque descarga las imágenes e instala las dependencias.

Luego abre **http://localhost:8080**

| Usuario | Contraseña | Llega a |
|---|---|---|
| `despachador` | `despachadorpatopan` | Despacho (clientes del cuaderno precargados) |
| `meson` | `mesonpatopan` | Mesón |
| `admin` | `adminpatopan` | Administración (ambos módulos + auditoría) |

> Estas contraseñas son las iniciales que pidió el cliente. Deben cambiarse antes de usar el sistema en producción.

### Comandos útiles

| Acción | Comando |
|---|---|
| Ver estado | `docker compose ps` |
| Ver logs de la API | `docker compose logs -f api` |
| Reconstruir tras cambios en el código | `docker compose up -d --build` |
| Detener (conserva los datos) | `docker compose down` |
| Detener y **borrar la base de datos** | `docker compose down -v` |
| Ver la BD en el navegador (Adminer) | `docker compose --profile tools up -d adminer` → http://localhost:8081 (servidor `db`) |
| Probar la API | `curl http://localhost:8080/api/health` |

## 4. Migraciones de base de datos (Prisma)

El esquema está en `backend/prisma/schema.prisma`.

- **Si no hay migraciones** (estado inicial del repositorio), la API sincroniza el esquema al arrancar con `prisma db push`.
- **Cuando hay migraciones** en `backend/prisma/migrations/`, la API aplica `prisma migrate deploy` al arrancar.

**Crear la primera migración versionada** (recomendado apenas el equipo valide el modelo):

```bash
docker compose down -v                 # parte con la BD vacía
docker compose up -d db                # levanta solo PostgreSQL (expuesto en localhost:5432)
cd backend
npm install
cp .env.example .env                   # ajusta la clave para que coincida con la del .env raíz
npx prisma migrate dev --name init     # crea backend/prisma/migrations/<fecha>_init
cd ..
docker compose up -d --build           # la API ahora usa "migrate deploy"
```

Para cada cambio posterior del modelo: edita `schema.prisma` → `npx prisma migrate dev --name descripcion_del_cambio` → haz commit de la carpeta `migrations`.

## 5. Desarrollo con recarga automática (opcional)

Para no reconstruir contenedores en cada cambio:

```bash
docker compose up -d db                      # solo la base de datos en Docker

# Terminal 1 - API en http://localhost:3000/api
cd backend && npm install && cp .env.example .env && npx prisma generate && npm run start:dev

# Terminal 2 - Frontend en http://localhost:4200 (redirige /api a :3000)
cd frontend && npm install && npm start
```

## 6. Estructura del repositorio

```
patopan/
├── docker-compose.yml      # db + api + web (+ adminer opcional)
├── .env.example            # variables de entorno (copiar a .env)
├── backend/                # API NestJS + Prisma
│   ├── prisma/schema.prisma
│   ├── prisma/seed.js      # usuarios, repartidores y 40 clientes del cuaderno
│   └── src/
├── frontend/               # Angular + Nginx
│   ├── nginx.conf
│   └── src/app/
└── docs/                   # arquitectura y modelo de datos
```

## 7. Flujo de trabajo con Trello

Cada historia de usuario del tablero tiene un checklist de **criterios de aceptación** y su **DoD**. Las tarjetas avanzan por las columnas Ideas → Backlog → En Análisis → Listo para Desarrollo → En Desarrollo → Pruebas → 🎉 Terminado. Se recomienda una rama de git por tarjeta, por ejemplo `feature/despacho-planilla-diaria`.
