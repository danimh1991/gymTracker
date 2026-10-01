# Gym Tracker — decisiones antes de implementar

## Alcance

Primera entrega: Fase 1 completa (inicio, ciclo de entrenamiento configurable, sesión recuperable, series, referencia anterior, finalización e histórico). Se añaden las funciones puras de progresión y sus pruebas, peso corporal, gestión de plantillas y exportación JSON por su utilidad inmediata. El resto se mantiene en el plan, sin simular funciones terminadas.

## Arquitectura

React + TypeScript estricto sobre Vite/Vinext, elegido por el adaptador de despliegue privado a Workers de Sites. Vinext aporta rutas y API; no se necesita un servidor Node en producción. CSS propio mobile-first. SQLite mediante D1, con consultas preparadas y migraciones Drizzle. La lógica de dominio no importa Cloudflare.

Carpetas: `app/` rutas y estilos; `components/` interfaz; `domain/` entidades; `services/` reglas puras; `repositories/` contrato y adaptador SQL; `database/` datos iniciales y acceso al binding; `db/schema.ts` esquema; `drizzle/` migraciones; `tests/` pruebas.

## Esquema relacional

Exercise: identidad, nombre corto, tipo, patrón, músculos, equipo, métrica, capacidades de carga, rangos, RIR, notas, enabled.
Routine → RoutineDay → RoutineExercise: secuencia, orden, ejercicio, series, rangos, RIR, opcional, notas.
Workout → WorkoutExercise → WorkoutSet: estado, inicio/fin, copia de prescripción y nombre; serie con reps, peso, peso corporal, asistencia, lastre, RIR/RPE, segundos, distancia, notas, completed y timestamp.
BodyWeight: fecha y kg. Skill → SkillProgression → SkillLog. Goal: métrica y meta. PersonalRecord: ejercicio, métrica, valor, fecha y serie.
UserSettings: preferencias por usuario, incluido el número de días activos del ciclo.

Cada tabla de usuario se separa por `ownerId`; demo usa un espacio distinto. Una restricción única impide dos sesiones activas por espacio. Inicio y finalización son transacciones por batch. Solo finalizar una sesión con series guardadas avanza la secuencia; iniciar, abandonar y recargar no la avanzan. Se conserva el día realmente elegido. Editar rutinas no altera las sesiones ya iniciadas.

## Decisiones de datos y UX

- Datos persistentes en D1, no en un JSON del navegador. Guardar cada serie confirma la escritura antes de avanzar. Borradores locales temporales recuperan entradas todavía sin enviar; no son la fuente del histórico.
- Peso corporal opcional, copiado al iniciar; nunca inventar peso. Asistencia y lastre separados y no simultáneos.
- Repeticiones y RIR inicialmente vacíos. Copiar anterior transfiere solamente cargas, nunca reps/RIR.
- Finalización parcial permitida con confirmación y resumen fiel. Campos grandes, botones de RIR y descanso no bloqueante.
- Acceso privado en Sites y validación de identidad en la API. Cambiar de dispositivo requiere usar el mismo sitio y cuenta. Preview local y producción tienen bases separadas.
- Pruebas de secuencia, progresiones, récords, conversión histórica e integración SQLite; compilación TypeScript y build.

## Entregas pendientes tras Fase 1

Fase 2: gráficas completas por ejercicio, PRs persistidos y objetivos visuales avanzados. Fase 3: editor completo de biblioteca/rutina, skills, importador WorkoutWise con previsualización/mapeo/deduplicación y restauración validada de backups. Fase 4: PWA y cola de sincronización offline. No se promete registro offline en esta entrega. Las tablas y separación de capas permiten incorporarlo sin rehacer sesiones.
