# Integración LLM

Esta carpeta contiene solamente infraestructura. Todavía no decide si el modelo
crea sesiones, propone cambios o actúa como asistente durante un entrenamiento.

## Worker

La aplicación busca, por orden:

1. `LLM_WORKER`, un service binding privado de Cloudflare.
2. `LLM_WORKER_URL`, una URL HTTPS, con `LLM_WORKER_TOKEN` opcional.

El endpoint de comprobación es `/health` y se puede cambiar con
`LLM_HEALTH_PATH`. `GET /api/llm/status` comprueba la conexión sin exponer URL,
token ni contenido del bucket. Está protegido por el mismo PIN que el resto de
la API.

No hay todavía un endpoint público de inferencia. Los casos de uso futuros deben
crear un adaptador de dominio que use `LlmWorkerClient`; no deben llamar al
worker directamente desde componentes React.

## R2

Binding: `LLM_DATA`. Bucket compartido de producción: `llm-core-knowledge`
(jurisdicción `eu`). GymTracker queda aislado bajo su prefijo propio.

Todas las claves pertenecen a `gym-tracker/v1/` y el índice canónico vive en
`gym-tracker/v1/manifest.json`. El manifiesto permite cambiar el contenido sin
que el worker tenga que listar todo el bucket.

Estructura propuesta:

```text
gym-tracker/v1/
  manifest.json
  catalog/exercises.json
  catalog/templates.json
  guidance/training-rules.md
  profiles/<profile-id>/context.json
  sessions/<profile-id>/<workout-id>.json
  summaries/<profile-id>/<workout-id>.json
```

Los datos personales no deben escribirse hasta decidir retención, borrado y qué
información necesita realmente el modelo. `LlmKnowledgeStore` restringe claves,
tipos de contenido y versión del manifiesto para preparar ese trabajo.

Los primeros archivos versionados viven en `r2/`. Se validan sin tocar Cloudflare
con `npm run llm:r2:validate` y se publican (archivos primero, manifiesto al final)
con `npm run llm:r2:upload`. `LLM_R2_BUCKET` y `LLM_R2_JURISDICTION`
permiten apuntar temporalmente a otro bucket o jurisdicción.

El bucket compartido ya existe; no se debe crear otro para cada aplicación.

Para usar un service binding, añadir a Wrangler cuando conozcamos el nombre real
del worker:

```json
"services": [
  { "binding": "LLM_WORKER", "service": "NOMBRE_REAL_DEL_WORKER" }
]
```
