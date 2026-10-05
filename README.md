# Gym Tracker

El proyecto está en `app/`. Consulta `app/README.md` para iniciar la aplicación y `app/ARCHITECTURE.md` para las decisiones de diseño.

Incluye acceso protegido por PIN, perfiles locales seleccionables, ciclos configurables de 1 a 7 días, una sección propia para gestionar plantillas, registro y clonación de series, cambios durante la sesión, sesiones persistentes, histórico en calendario, deportes externos, resumen y avance automático. Los perfiles comparten ejercicios y plantillas, pero mantienen separados sus sesiones, progreso, peso, actividades y próximo día.

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
- Deploy: `npm run deploy`
- Root directory: vacío (raíz del repositorio)

El build instala de forma reproducible las dependencias de `app/` y compila con la ruta base `/gymtracker`. El comando de despliegue aplica primero las migraciones pendientes de D1 y después publica el Worker `gymtracker`, evitando que una versión nueva arranque contra un esquema antiguo.

El despliegue de Cloudflare solicita el PIN `0812` antes de mostrar o modificar datos. Los perfiles se crean, seleccionan y eliminan desde Inicio; no son cuentas con contraseña. El PIN se puede cambiar mediante `APP_ACCESS_PIN`; para invalidar y reforzar las cookies de sesión se puede definir `PIN_SESSION_SECRET` como secreto del entorno.
