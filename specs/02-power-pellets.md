# SPEC 02 — Power pellets y fantasmas asustados

> **Estado:** Aprobado
> **Depende de:** SPEC 01 — Personalidades distintas para los 4 fantasmas
> **Fecha:** 2026-11-06
> **Objetivo:** Añadir cuatro power pellets que permitan a Pacman asustar y comer fantasmas, cuyos ojos regresarán a la jaula para regenerarse.

## Alcance

**Incluido:**

- Cuatro power pellets (PP) en las posiciones clásicas del original: `(1,3)`, `(26,3)`, `(1,23)` y `(26,23)`.
- Cada PP sustituye el dot de su celda, sin cambiar la geometría del laberinto.
- Efecto de miedo de 6 segundos de juego activo.
- Fantasmas asustados que huyen, pueden comerse y regresan como ojos a la jaula.
- Regeneración en la jaula y salida inmediata como enemigos normales.
- Puntuación clásica por PP y por cadena de fantasmas comidos.
- Pausa de 0,5 segundos al comer un fantasma.
- PP grandes y parpadeantes, apariencia asustada y ojos sin cuerpo.
- Integración con la liberación de fantasmas, pérdida de vidas, reinicio y victoria existentes.

**Fuera de alcance:**

- Sonidos y textos flotantes de puntuación.
- Nuevos niveles o dificultad progresiva.
- Alternancia global entre dispersión y persecución (scatter/chase).
- Cambios en las cuatro personalidades normales de la SPEC 01.
- Nuevas dependencias, herramientas de pruebas o cambios en controles y overlays.

## Reglas de juego

### Consumo de PP

- Cada PP concede 50 puntos y desaparece al consumirse.
- Los dots normales siguen concediendo 10 puntos.
- Cada PP cuenta como un consumible para los umbrales de liberación de la SPEC 01: `0/30/60/90`.
- Para ganar deben consumirse todos los dots y todos los PP.
- Comer un PP activa 6 segundos de miedo.
- Comer otro PP reinicia el efecto a 6 segundos, sin acumular duración.
- Cada PP reinicia la cadena de puntuación por fantasmas.
- La activación ocurre antes de resolver las colisiones de esa actualización, igual que el consumo actual de dots.

### Fantasmas asustados

- Adoptan color azul y cara de miedo.
- Durante los últimos 2 segundos del efecto alternan entre azul y blanco.
- En los cruces eligen la salida que más los aleje de Pacman por distancia Manhattan.
- Conservan la restricción normal de no invertir la marcha, salvo en callejones o por la activación de un PP.
- Cada activación solicita una única inversión de marcha a los fantasmas que ya circulan por el laberinto.
- Los fantasmas que están entrando o saliendo de la jaula no invierten su marcha durante ese trayecto.
- La velocidad asustada es `1/16` de celda por actualización.
- Al terminar el efecto recuperan su personalidad, apariencia y velocidad normales.
- Los fantasmas encerrados conservan los umbrales de liberación existentes.
- Los fantasmas aún no regenerados que salgan de la jaula durante el efecto salen asustados.

La huida dirigida es una adaptación solicitada por el usuario. El original utiliza movimiento seudoaleatorio durante el estado asustado.

### Comer fantasmas y regresar a la jaula

- Comer fantasmas concede sucesivamente 200, 400, 800 y 1600 puntos durante una misma activación.
- El fantasma comido se convierte inmediatamente en ojos, sin cuerpo.
- Cada captura congela el movimiento de Pacman y de todos los fantasmas durante 0,5 segundos.
- Durante la pausa no se resuelven nuevas colisiones ni se consume tiempo de miedo.
- El render continúa mostrando la escena, incluido el fantasma recién convertido en ojos.
- Después de la pausa, los ojos regresan por los pasillos y atraviesan la puerta hasta `(13,14)`, dentro de la jaula.
- La velocidad de los ojos es `1/10` de celda por actualización.
- Los ojos son inofensivos y no pueden comerse otra vez.
- La ruta debe garantizar el regreso desde cualquier celda alcanzable, incluido el túnel.
- No se permite teletransporte, atravesar paredes ni depender de una aproximación greedy que pueda entrar en bucle.
- El regreso no está limitado por la prohibición de giros de 180 grados de las personalidades normales.
- Al llegar a `(13,14)`, el fantasma recupera su cuerpo y sale inmediatamente por la puerta.
- No vuelve a esperar su umbral de dots.
- Tras regenerarse es un enemigo normal y peligroso, aunque siga activo el efecto anterior.
- Un nuevo PP sí puede volver a asustar a un fantasma regenerado.
- Un nuevo PP no interrumpe ni modifica el estado de los ojos que aún regresan.

### Pérdida de vida y reinicio

- Perder una vida cancela el miedo, la pausa y la cadena de puntos.
- Se restauran posiciones, apariencias y velocidades normales.
- Se mantienen la puntuación, los consumibles ya comidos y los fantasmas desbloqueados, como en la SPEC 01.
- Los PP comidos no reaparecen al perder una vida.
- Iniciar una partida nueva restaura los cuatro PP y todo el estado inicial.

## Modelo de datos

```js
// maze.js — nuevo símbolo del laberinto
// 'o' = power pellet, tile 4.

// game.js — propiedades nuevas en createGame()
game.frightenedRemainingMs = 0;
game.ghostsEatenChain = 0;
game.eatPauseRemainingMs = 0;

// Propiedades nuevas de cada fantasma
ghost.mode = 'normal'; // 'normal' | 'frightened' | 'eyes'
ghost.reversePending = false;
```

- `mode` determina apariencia, comportamiento y resultado de las colisiones.
- El temporizador global no sustituye a `mode`: un fantasma regenerado puede estar normal mientras otros siguen asustados.
- `released` conserva su significado actual de liberación desbloqueada.
- `dotsRemaining` pasa a contar tanto dots como PP pendientes.
- `dotsEaten` cuenta ambos tipos de consumible para liberar fantasmas.
- `speed` conserva la velocidad efectiva del segmento de movimiento actual.
- La velocidad normal sigue siendo `1/10` de celda por actualización.
- La velocidad de Pacman sigue siendo `1/8` de celda por actualización.
- `update( game, deltaMs )` recibe desde `main.js` el tiempo transcurrido.
- Los temporizadores utilizan milisegundos de juego activo, no cantidades de frames.
- Las posiciones siguen expresándose en celdas fraccionales.
- Las coordenadas tienen origen arriba a la izquierda y comienzan en cero.

### Transiciones y alineado

- Los cambios de apariencia y vulnerabilidad son inmediatos.
- Los cambios de velocidad se aplican al alcanzar una celda alineada.
- Una inversión pendiente se ejecuta una sola vez al alcanzar una celda alineada.
- Los ojos que se generan entre dos celdas completan el segmento actual antes de aplicar su nueva velocidad y decidir la ruta.
- La expiración del miedo elimina las inversiones de activación que aún no se hayan ejecutado.
- Perder una vida o iniciar otra partida limpia las inversiones pendientes y los temporizadores.

Estas reglas evitan que cambiar la velocidad a mitad de una celda rompa el contrato de `aligned()`.

## Archivos afectados

| Archivo | Cambios |
| --- | --- |
| `src/js/maze.js` | Símbolo `o`, tile 4 y cuatro posiciones clásicas de PP. |
| `src/js/game.js` | Consumo, contadores, estados, temporizadores, huida, colisiones, puntuación, pausa, regreso y regeneración. |
| `src/js/render.js` | PP grandes y parpadeantes, fantasmas asustados, aviso azul/blanco y ojos sin cuerpo. |
| `src/js/main.js` | Medición y entrega del tiempo transcurrido a `update`. |

No se añaden archivos JavaScript. Se conservan los globals y el orden actual de scripts en `src/index.html`. La simulación sigue en `game.js` y el dibujo en `render.js`.

## Plan de implementación

Cada paso debe dejar el juego ejecutable y poder confirmarse por separado. Las modificaciones grandes se dividen en unidades pequeñas durante la implementación.

1. **Añadir los PP de extremo a extremo.** Incorporar el símbolo, parseo, posiciones y dibujo. Actualizar el consumo, los 50 puntos y ambos contadores. Verificación manual: existen cuatro PP y no puede ganarse dejándolos sin comer.
2. **Introducir estados individuales.** Inicializar `mode` e inversión pendiente. Separar en el render el cuerpo y los ojos sin cambiar todavía el comportamiento normal. Verificación manual: la partida conserva los cuatro fantasmas y sus personalidades.
3. **Integrar el tiempo de juego.** Pasar `deltaMs` desde `main.js` y preparar los temporizadores. Mantener el movimiento base por actualización. Verificación manual: controles y velocidades normales no cambian.
4. **Activar y expirar el miedo.** Añadir activación por PP, renovación del tiempo y transición visual azul con aviso final. Verificación manual: otro PP devuelve el temporizador a 6 segundos y la expiración restaura los fantasmas normales.
5. **Añadir la huida y las transiciones seguras.** Implementar elección de salidas, inversión pendiente y velocidad asustada con cambios en celdas alineadas. Verificación manual: los fantasmas huyen sin quedarse desalineados.
6. **Preparar la ruta de regreso.** Incorporar una búsqueda de caminos por celdas transitables para fantasmas. Contemplar la puerta y las conexiones del túnel. Verificación manual desde consola: se obtiene una ruta válida a `(13,14)` desde ambos extremos del túnel y los distintos corredores.
7. **Conectar capturas y pausa.** Resolver las colisiones según `mode`, sumar la cadena, convertir en ojos y congelar la simulación durante 0,5 segundos. Verificación manual: las capturas no quitan vidas y los ojos son inofensivos.
8. **Completar el ciclo de los ojos.** Ejecutar el regreso a `1/10` de celda por actualización, regenerar dentro de la jaula y salir inmediatamente como enemigo normal. Verificación manual: un regenerado vuelve a ser peligroso y otro PP puede asustarlo de nuevo.
9. **Integrar pérdida de vida y reinicio.** Limpiar estados temporales y velocidades sin restaurar consumibles ni bloquear fantasmas ya liberados. Verificación manual: una nueva partida sí restaura los cuatro PP.

## Criterios de aceptación

La verificación se realiza sirviendo `src/` y utilizando el navegador y su consola, sin introducir tooling de pruebas.

- [ ] Aparecen exactamente cuatro PP grandes y parpadeantes en `(1,3)`, `(26,3)`, `(1,23)` y `(26,23)`.
- [ ] Cada PP sustituye un dot y no modifica paredes, puerta ni túnel.
- [ ] Comer un PP suma 50 puntos, lo elimina y actualiza `dotsRemaining` y `dotsEaten` una sola vez.
- [ ] Los dots normales siguen sumando 10 puntos.
- [ ] Los PP pendientes impiden ganar, aunque no queden dots normales.
- [ ] Los fantasmas conservan los umbrales de liberación `0/30/60/90`, contando también los PP.
- [ ] El miedo dura 6 segundos de juego activo, excluyendo las pausas de captura.
- [ ] Comer otro PP reinicia el temporizador a 6 segundos y la cadena a cero.
- [ ] Los fantasmas asustados huyen, se ralentizan y muestran el aviso azul/blanco durante los últimos 2 segundos.
- [ ] Cada activación provoca una sola inversión de los fantasmas que circulan fuera de la jaula, en la siguiente celda alineada.
- [ ] Los cambios de velocidad no dejan actores desalineados, detenidos permanentemente ni atravesando paredes.
- [ ] Comer cuatro fantasmas durante una activación concede 200, 400, 800 y 1600 puntos, respectivamente.
- [ ] Cada captura congela todos los movimientos y el temporizador de miedo durante 0,5 segundos.
- [ ] Durante la pausa se ven los ojos del fantasma recién comido y no se procesan nuevas capturas.
- [ ] Los ojos regresan visiblemente a `(13,14)` por una ruta válida, también desde ambos lados del túnel.
- [ ] Los ojos avanzan a `1/10` de celda por actualización tras completar el segmento de la captura.
- [ ] Los ojos atraviesan la puerta, pero nunca las paredes.
- [ ] Los ojos no dañan a Pacman ni conceden puntos por contactos posteriores.
- [ ] Otro PP no convierte los ojos en un fantasma asustado ni interrumpe su regreso.
- [ ] Un fantasma recupera su cuerpo dentro de la jaula y sale sin esperar su umbral de dots.
- [ ] Un fantasma regenerado puede quitar una vida aunque quede tiempo del PP anterior.
- [ ] Un nuevo PP vuelve vulnerable a ese fantasma regenerado.
- [ ] Los fantasmas aún encerrados no se liberan antes por el PP y salen asustados si corresponde.
- [ ] Al expirar el miedo, los fantasmas asustados recuperan su personalidad, apariencia y velocidad normales.
- [ ] Perder una vida limpia los efectos sin restaurar consumibles ni volver a bloquear fantasmas liberados.
- [ ] Reiniciar la partida restaura los cuatro PP y deja todos los temporizadores y la cadena a cero.
- [ ] Las personalidades normales, controles, vidas y overlays conservan su funcionamiento.
- [ ] La consola no presenta errores al iniciar, capturar, regenerar, perder una vida o reiniciar.

## Decisiones tomadas y descartadas

- **Sí:** posiciones clásicas del original, confirmadas tras corregir la interpretación inicial de «esquinas». No se usan las celdas extremas `(1,1)`, `(26,1)`, `(1,29)` y `(26,29)`.
- **Sí:** 6 segundos de miedo, con aviso durante los últimos 2 segundos, tomando como referencia el primer nivel clásico.
- **Sí:** huida dirigida por distancia Manhattan, por petición del usuario y coherencia con el modelo actual.
- **No:** movimiento seudoaleatorio asustado del original, porque no garantiza la huida solicitada.
- **Sí:** 50 puntos por PP y cadena de 200/400/800/1600 por activación, siguiendo la puntuación clásica.
- **Sí:** pausa de 0,5 segundos por captura, duración elegida por el usuario.
- **Sí:** temporizadores en milisegundos de juego activo, para no ligar su duración al número de frames.
- **Sí:** velocidades `1/16` para asustados y `1/10` para ojos, aplicadas en celdas alineadas.
- **Sí:** ruta garantizada para los ojos, en lugar de decisiones greedy que puedan provocar bucles.
- **Sí:** estado individual por fantasma, porque pueden coexistir fantasmas asustados, ojos y enemigos regenerados normales.
- **Sí:** regeneración como enemigo normal aunque siga activo el PP anterior, siguiendo la mecánica clásica.
- **Sí:** contar PP para los umbrales de liberación, evitando retrasarlos al sustituir cuatro dots.
- **No:** restaurar PP al perder una vida, porque el progreso del laberinto se conserva.
- **No:** modificar las personalidades normales, la geometría o el sistema global de scripts.

## Cambio de última hora — Regreso más lento de los ojos

- **Fecha:** 2026-11-06.
- **Motivo:** durante la revisión, el usuario observó que el regreso a `1/5` regeneraba a los fantasmas demasiado rápido y reducía la ventaja de capturarlos.
- **Cambio acordado:** reducir la velocidad de los ojos a `1/10` de celda por actualización, la mitad de la velocidad inicialmente prevista. Para la misma ruta, el regreso tarda aproximadamente el doble.
- Se conserva el cambio de velocidad solo en celdas alineadas, la ruta garantizada y la regeneración inmediata como enemigo normal al llegar a `(13,14)`. No se añade una espera en la jaula.

## Riesgos identificados

| Riesgo | Mitigación |
| --- | --- |
| Cambiar la velocidad a mitad de una celda impide volver a alinearse | Mantener la velocidad del segmento actual y cambiarla solo al alcanzar una celda alineada. |
| Los ojos quedan atrapados o la lógica actual de salida los expulsa antes de llegar al destino | Dar prioridad a la ruta de regreso mientras `mode === 'eyes'` y regenerar únicamente en `(13,14)`. |
| El temporizador global vuelve a asustar a un fantasma ya regenerado | Usar `mode` individual; solo una nueva activación de PP puede cambiarlo de normal a asustado. |
| La pausa consume tiempo de miedo o permite capturas sucesivas en la misma escena congelada | Detener movimiento, colisiones y cuenta de miedo mientras dure `eatPauseRemainingMs`. |
| Sustituir dots por PP altera la victoria o los umbrales de liberación | Incluir ambos tipos de consumible en el conteo inicial y en el consumo. |

## Qué no incluye esta especificación

- Sonidos y textos flotantes de puntuación.
- Nuevos niveles, dificultad progresiva y modos scatter/chase temporizados.
- Movimiento seudoaleatorio de los fantasmas asustados.
- Cambios de personalidad normal, controles, overlays o geometría del laberinto.
- Nuevas dependencias, bundler o infraestructura de pruebas.
