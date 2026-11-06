# AGENTS.md

Proyecto didáctico: clon de Pac-Man en Vanilla JS para aprender **Spec-Driven Development**. Sin build, sin tests, sin linter.

## Ejecutar

- No hay `package.json` ni tooling. Servir `src/` como estático y abrir en el navegador:
  ```bash
  npx serve src      # o cualquier servidor estático
  ```
  (Abrir `src/index.html` directamente también funciona; no hay módulos ES.)

## Arquitectura (no hay bundler: todo por globals)

El orden de `<script>` en `src/index.html` es parte del contrato: `maze.js → game.js → render.js → main.js`. Los archivos se comunican solo vía `window.*` (p. ej. `window.MAZE`, `window.createGame`, `window.update`, `window.draw`). Añadir un archivo nuevo exige: exportar globals con `window.X = ...` y agregar su `<script>` en `index.html` en el orden correcto. No usar `import`/`export`.

Responsabilidades:
- `maze.js` — laberinto 28×31 escrito como strings legibles (`#` pared, `.` dot, ` ` vacío, `-` puerta) que se parsean. `MAZE` es prístino: **no mutarlo**; `createGame()` copia a `game.grid`.
- `game.js` — estado y reglas (`createGame`/`update`). Estados: `start | playing | won | lost`.
- `render.js` — canvas con `TILE = 20`. El canvas en `index.html` es 560×620 = 28·20 × 31·20: cambiar `TILE` exige cambiar el canvas.
- `main.js` — bucle `requestAnimationFrame`, teclado y overlays.

Gotchas de la simulación:
- Movimiento por celdas fraccionales: `PACMAN_SPEED = 1/8`, `GHOST_SPEED = 1/10` celda/frame; la lógica solo decide en celdas alineadas (`aligned()`). Cambiar velocidades rompe el alineado si no son divisoras de 1.
- Fantasmas atraviesan la puerta (tile 3), Pacman no. El túnel (fila 14) hace wrap horizontal.

## Flujo de trabajo: Spec-Driven

- El proyecto usa las skills `spec` y `spec-impl` (instaladas en `.agents/skills/`, fijadas en `skills-lock.json`, fuente `Klerith/fernando-skills`). Son **solo invocables por el usuario** (`disable-model-invocation: true`): no las ejecutes por tu cuenta; el usuario las llama como `/spec` y `/spec-impl <NN-nombre>`.
- Los specs viven en `specs/` (aún no existe). `spec-impl` crea una rama de git por spec (config opcional en `specs/.spec-config.yml`).
- Los specs se escriben según la plantilla en `.agents/skills/spec/template.md`.

## Convenciones

- Todo el contenido (comentarios, UI, specs) está en **español**; mantén ese idioma y responde en el idioma del prompt.
- Estilo de código: paréntesis separados del identificador — `foo( x, y )`, no `foo(x, y)`.
- `canvas` es el único render: cambia estado en `game.js`, dibuja en `render.js`; nunca mezcles.
