# Código fuente

El código se mantiene en repositorios dedicados, con historial de ramas y Pull Requests:

| Repositorio | Contenido |
|---|---|
| [ortgvdev/patopan](https://github.com/ortgvdev/patopan) | Sistema web: `frontend/` (Angular 19), `backend/` (NestJS 11 + Prisma 6), `docker-compose.yml`. |
| `patopan-metricas` | Panel de métricas de avance desde Trello (Angular + NestJS). |

Para cada entrega se agrega aquí un `.zip` con la versión entregada, generado desde el repositorio de código con:

```bash
git archive --format=zip -o patopan-fase2.zip main
```
