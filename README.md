# Gym Tracker

El proyecto está en `app/`. Consulta `app/README.md` para iniciar la aplicación y `app/ARCHITECTURE.md` para las decisiones de diseño.

Incluye rutina A/B/C, plantillas múltiples editables, registro y clonación de series, cambios durante la sesión, sesiones persistentes, histórico, resumen y avance automático. También incorpora una biblioteca ampliable, peso corporal, estadísticas básicas, demo aislada e importación/exportación.

Vista previa local: http://127.0.0.1:5173/ (mientras el servidor esté iniciado).

```powershell
cd app
node scripts/run-framework.mjs dev
```

Este comando reutiliza las dependencias ya instaladas. Para una instalación nueva, seguir `app/README.md`.

El proyecto genera un Worker ESM compatible con Cloudflare y declara su base D1 como `DB`. Las migraciones están versionadas en `app/drizzle/`; consulta `app/README.md` para el build y el despliegue.

## Cloudflare Builds desde Git

La raíz del repositorio contiene un `package.json` puente y `wrangler.jsonc`, por lo que la integración de Git puede mantener sus comandos predeterminados:

- Build: `npm run build`
- Deploy: `npx wrangler deploy`
- Root directory: vacío (raíz del repositorio)

El build instala de forma reproducible las dependencias de `app/`, compila con la ruta base `/gymtracker` y despliega el Worker `gymtracker` con la D1 `gym-tracker-db`.
