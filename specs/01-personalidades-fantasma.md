# SPEC 01 — Personalidades distintas para los 4 fantasmas

> **Estado:** Implementado
> **Depende de:** ninguno
> **Fecha:** 2026-11-06
> **Objetivo:** Sustituir los 2 fantasmas actuales por 4 fantasmas con personalidades clásicas distintas (uno persigue agresivamente a Pacman), liberación escalonada por dots y color propio por fantasma.

## Alcance

**In:**

- `maze.js`: `GHOST_STARTS` pasa a 4 entradas con los kinds `hunter`, `ambusher`, `flanker` y `wanderer`.
- `game.js`: contador `dotsEaten`, umbrales de salida de la pen, lógica de salida por la puerta y `decideGhost` con un comportamiento por kind.
- `render.js`: color clásico por fantasma (rojo, rosa, cian, naranja) según el kind.

**Out of scope (para futuros specs):**

- Modo asustado (frightened) con power pellets; merece spec propio porque cambia tiles, puntuación y render.
- Modos globales scatter/chase temporizados.
- Cambios de velocidad por fantasma, sonido, dificultad por nivel y cambios en el laberinto.

## Data model

```js
// maze.js — GHOST_STARTS pasa de 2 a 4
const GHOST_STARTS = [
  { x: 13, y: 11, kind: 'hunter' },   // fuera de la pen, sobre la puerta: activo desde el inicio
  { x: 12, y: 14, kind: 'ambusher' }, // dentro de la pen
  { x: 13, y: 14, kind: 'flanker' },  // dentro de la pen
  { x: 14, y: 14, kind: 'wanderer' }, // dentro de la pen
];

// game.js — createGame()
game.dotsEaten = 0; // se incrementa en movePacman al comer un dot
// cada fantasma gana la propiedad `released` (booleano)
const EXIT_DOTS = { hunter: 0, ambusher: 30, flanker: 60, wanderer: 90 };

// render.js
const GHOST_COLORS = { hunter: 'red', ambusher: 'pink', flanker: 'cyan', wanderer: 'orange' };
```

Convención de objetivos: distancias Manhattan; los targets de `ambusher`/`flanker` se clampan al rango del laberinto (x 0–27, y 0–30) antes de usarlos.

## Comportamientos (target por kind)

- **hunter (agresivo):** sin cambios respecto al `'hunter'` actual; elige siempre la salida que minimiza la distancia Manhattan a Pacman.
- **ambusher:** embosca; su target es la celda 4 casillas delante de Pacman en su dirección actual (`p.dir`), clampeada.
- **flanker:** cálculo clásico adaptado al grid: `P2` = celda 2 casillas delante de Pacman; target = `P2 + (P2 − hunterPos)`, clampeado. Usa la posición del `hunter` como referencia.
- **wanderer:** si dist(Pacman) ≥ 8 persigue (como hunter); si no, elige la salida que **maximiza** la distancia Manhattan a Pacman.

En todos los casos se excluye la dirección inversa (giro de 180° solo en callejón), como hoy.

## Implementation plan

1. `maze.js`: reemplazar `GHOST_STARTS` por las 4 entradas. Prueba manual: el juego arranca igual con 4 fantasmas (2 con kind sin lógica todavía).
2. `game.js`: añadir `dotsEaten` en `createGame`/`movePacman` y la constante `EXIT_DOTS`; un fantasma con `released === false` permanece quieto en su celda inicial. Prueba manual: los 3 de la pen no se mueven.
3. `game.js`: lógica de salida: al alcanzarse su umbral, el fantasma sale **caminando** — mientras esté en la pen (y ≥ 13) avanza hacia (13, 11) por camino greedy (col 13 arriba, atravesando la puerta tile 3, que los fantasmas ya atraviesan); al llegar a y ≤ 11 pasa a comportamiento normal. Tras perder una vida, `resetPositions` devuelve a cada uno a su inicio y los ya liberados re-salen de inmediato.
4. `game.js`: dispatcher en `decideGhost` con los 4 comportamientos (se elimina la rama `'random'`). Prueba manual: cada uno se nota distinto.
5. `render.js`: `GHOST_COLORS` por kind en el dibujo. Prueba manual: colores correctos en pantalla.
6. Verificación final con `npx serve src` contra la lista de criterios de aceptación.

## Criterios de aceptación

- [ ] La partida contiene exactamente 4 fantasmas con kinds `hunter`, `ambusher`, `flanker` y `wanderer`.
- [ ] El `hunter` empieza en (13, 11), fuera de la pen, y persigue siempre por la distancia Manhattan mínima (comportamiento actual intacto).
- [ ] El `ambusher` apunta a la celda 4 delante de Pacman en su dirección actual.
- [ ] El `flanker` calcula su objetivo a partir de la posición del `hunter` y 2 casillas delante de Pacman.
- [ ] El `wanderer` persigue con distancia ≥ 8 casillas y huye maximizando la distancia por debajo de 8.
- [ ] `ambusher`/`flanker`/`wanderer` salen de la pen al comer 30/60/90 dots, caminando por (13, 12) hasta (13, 11).
- [ ] Tras perder una vida, cada fantasma vuelve a su posición inicial y los ya liberados re-salen a la vez.
- [ ] Colores en canvas: hunter rojo, ambusher rosa, flanker cian, wanderer naranja.
- [ ] Colisiones, vidas, puntuación y condición de victoria no cambian respecto a hoy.
- [ ] Consola sin errores.

## Decisiones

- **Sí:** 4 personalidades clásicas (persecución directa, emboscada, flanqueo, timidez) adaptadas al grid de celdas, porque son conocidas y ya incluyen al agresivo que pidió el usuario.
- **Sí:** nombres `hunter/ambusher/flanker/wanderer` en lugar de `blinky/pinky/inky/clyde`, para no acoplarse a la marca de Pac-Man.
- **Sí:** salida escalonada por dots comidos (0/30/60/90), determinista y fácil de verificar a mano.
- **Sí:** `hunter` arranca fuera de la pen en (13, 11); los otros 3 dentro.
- **Sí:** salida caminando por la puerta, no teletransporte: es visualmente correcta y cuesta poco.
- **No:** modo frightened/power pellets. Otro spec.
- **No:** alternancia global scatter/chase. Otro spec.
- **No:** disparadores por tiempo en frames o mixtos. Los dots ya existen y son deterministas.

## Risks

| Riesgo | Mitigación |
| --- | --- |
| El target de `ambusher`/`flanker` cae fuera del laberinto o detrás de una pared | Clampeo al rango del laberinto; la elección greedy por distancia Manhattan tolera targets inalcanzables (como hoy hace `hunter`) |
| Fantasmas superpuestos entre sí | Sin colisión entre fantasmas, igual que hoy |

## What is **not** in this spec

- Modo frightened con power pellets y puntos por comer fantasmas.
- Scatter/chase temporizados.
- Velocidades distintas por fantasma, sonido, dificultad progresiva.
- Cambios al laberinto, a `main.js` o a los overlays.

Cada uno de esos, si aterriza, va en su propio spec.
