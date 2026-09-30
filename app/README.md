# Gym Tracker

Aplicación personal de gimnasio hacia calistenia. Primera entrega centrada en la Fase 1.

## Incluido

- Rutina A/B/C completa, secuencia basada exclusivamente en sesiones terminadas y selección manual.
- Inicio idempotente, registro por serie, RIR, reps o segundos, peso, lastre y asistencia separados.
- Recuperación de sesiones tras cerrar/recargar. Borrador local de campos sin enviar; la base de datos es la fuente del histórico.
- Referencias anteriores, copiar únicamente cargas, temporizador opcional y edición de series activas.
- Finalización parcial explícita, resumen, comparación, histórico con filtros.
- Primeras recomendaciones de progresión, métricas básicas, objetivos iniciales, peso corporal.
- Exportación JSON y CSV. Demo aislada con reinicio.
- Plantillas múltiples por día con selector, edición previa, importación y exportación JSON.
- Edición de ejercicios y objetivos durante una sesión; añadir, sustituir o quitar ejercicios aún no realizados.
- Clonar una serie en la siguiente posición, abriéndola para revisión antes de guardarla.
- Biblioteca ampliable con alta individual e importación/exportación masiva.

## Desarrollo

Node 24 recomendado (las pruebas usan `node:sqlite`), npm y Git.

```sh
npm ci
npm run check
npm test
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_chubby_jubilee.sql
npm run dev
```

Aplicar la migración solo la primera vez en una base local nueva. `npm run db:generate` genera futuras migraciones. La vista local usa SQLite persistente bajo `.wrangler/state` y es independiente de producción. No borrar esa carpeta si contiene registros que quieras conservar.

Vista local: `http://127.0.0.1:5173/`. El inicio de sesión simulado solo existe en desarrollo local. En producción el acceso privado lo gestiona Sites y la API exige identidad autenticada. No exponer el servidor de desarrollo en Internet.

Publicación mediante Sites: `.openai/hosting.json` identifica el sitio y declara D1. El adaptador `database/connection.ts` es el único que importa el binding; servicios y contrato del repositorio no dependen de Cloudflare. Para otro despliegue Workers hay que configurar identidad confiable y D1; no basta copiar cabeceras desde clientes públicos.

## Formatos de importación

La exportación de la propia aplicación es el formato recomendado para volver a importar. Los archivos de ejercicios contienen `{ "exercises": [...] }`; los de plantillas contienen `{ "templates": [...] }`. También se acepta directamente el array. Las plantillas referencian ejercicios por `exerciseId`, por lo que primero deben importarse los ejercicios desconocidos.

## Cloudflare Workers

El build genera un Worker ESM en `dist/server/index.js` y `dist/server/wrangler.json`. D1 se declara como `DB` en `.openai/hosting.json`; las migraciones incrementales están en `drizzle/`. El acceso a D1 queda detrás de `TrainingRepository`, y la autenticación usa las cabeceras verificadas que inyecta Sites. Para desplegar fuera de Sites hay que proporcionar un mecanismo de identidad equivalente en el borde.

## Limitaciones explícitas

No es todavía la aplicación de las cuatro fases. Quedan: reordenación visual de plantillas, edición avanzada de todos los campos de la biblioteca, skills editables, gráficas completas y PRs persistidos/notificaciones, objetivos editables, importador WorkoutWise con preview/mapeo/deduplicación, restauración JSON y PWA/sincronización offline. La conversión histórica de 1 kg existe como función testeada, no como importador terminado. Los campos RPE/distancia existen en el modelo, pero no se muestran en esta rutina. Las sesiones completadas se consultan; solo las activas se editan.

Requiere conexión para confirmar cada serie. Si falla una escritura, muestra error y conserva los campos para reintentar. Los datos de prueba nunca se insertan en el espacio real. Una exportación contiene todos los registros del espacio seleccionado; la restauración desde la UI sigue pendiente.

## Validación

`npm test`: 10 pruebas de dominio e integración con SQLite real: secuencia, dominadas, 3×10/3×12, fondos/RIR, récords, excepción histórica, validación de datos y CSV, inicio/guardado idempotentes, recuperación, cierre parcial, aislamiento por usuario y reinicio demo. Revisión del navegador: guardar serie, recargar y continuar, terminar Día A y comprobar recomendación B. TypeScript estricto y build de producción.

Consulta `ARCHITECTURE.md` para decisiones, esquema y estructura de carpetas.
