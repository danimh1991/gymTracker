# Gym Tracker

El proyecto está en `app/`. Consulta `app/README.md` para iniciar la aplicación y `app/ARCHITECTURE.md` para las decisiones de diseño.

Primera entrega: rutina A/B/C, registro por series, sesiones persistentes, histórico, resumen y avance automático. Incluye además peso corporal, estadísticas básicas, demo aislada y exportación.

Vista previa local: http://127.0.0.1:5173/ (mientras el servidor esté iniciado).

```powershell
cd app
node scripts/run-framework.mjs dev
```

Este comando reutiliza las dependencias ya instaladas. Para una instalación nueva, seguir `app/README.md`.

La publicación remota no se completó: los scripts locales del plugin Sites dejaron de estar disponibles durante la sesión. El manifiesto conserva el identificador ya reservado; reutilizarlo al continuar, sin crear otro sitio.
