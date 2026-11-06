// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames
const GHOST_SPEED = 0.1;    // 1/10 celda/frame
const FRIGHTENED_SPEED = 1 / 16;
const EYES_SPEED = 1 / 10;
const EXIT_DOTS = { hunter: 0, ambusher: 30, flanker: 60, wanderer: 90 };
const FRIGHTENED_DURATION_MS = 6000;
const EAT_PAUSE_DURATION_MS = 500;

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots y power pellets sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 || v === 4 ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    dotsRemaining: dots,
    dotsEaten: 0,
    frightenedRemainingMs: 0,
    ghostsEatenChain: 0,
    eatPauseRemainingMs: 0,
    grid,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ( g ) => ( {
      x: g.x,
      y: g.y,
      dir: 'up',
      speed: GHOST_SPEED,
      kind: g.kind,
      released: EXIT_DOTS[ g.kind ] === 0,
      mode: 'normal', // 'normal' | 'frightened' | 'eyes'
      reversePending: false,
    } ) ),
  };
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado solo por pared (1)
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  return v === 3 && actor === 'pacman';
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove( grid, x, y, dir, actor ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  return !isWall( grid, tx, ty, actor );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

// Incluye el segmento entre la puerta y la salida en la fila 11.
function isInPenPassage( g ) {
  return g.x >= 11 && g.x <= 16 && g.y > 11 && g.y <= 15;
}

function activateFrightened( game ) {
  game.frightenedRemainingMs = FRIGHTENED_DURATION_MS;
  game.ghostsEatenChain = 0;
  for ( const g of game.ghosts ) {
    if ( g.mode === 'eyes' ) continue;
    g.mode = 'frightened';
    g.reversePending = g.released && !isInPenPassage( g );
  }
}

function updateFrightened( game, deltaMs ) {
  if ( game.frightenedRemainingMs <= 0 ) return;
  game.frightenedRemainingMs = Math.max( 0, game.frightenedRemainingMs - deltaMs );
  if ( game.frightenedRemainingMs === 0 ) {
    for ( const g of game.ghosts ) {
      if ( g.mode === 'frightened' ) g.mode = 'normal';
      g.reversePending = false;
    }
  }
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot o power pellet, contando ambos para victoria y liberación.
    const tile = grid[ p.y ][ p.x ];
    if ( tile === 2 || tile === 4 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += tile === 4 ? 50 : 10;
      game.dotsRemaining--;
      game.dotsEaten++;
      if ( tile === 4 ) activateFrightened( game );
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

function decideGhost( game, g ) {
  const grid = game.grid;
  const p = game.pacman;

  const options = Object.keys( DIRS ).filter(
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, 'ghost' )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ '' + OPPOSITE[ g.dir ] ];

  const px = Math.round( p.x );
  const py = Math.round( p.y );
  let targetX = px;
  let targetY = py;
  let flee = false;

  switch ( g.mode === 'frightened' ? 'frightened' : g.kind ) {
    case 'frightened':
      flee = true; // Todos huyen de Pacman, sin cambiar su personalidad normal.
      break;
    case 'hunter':
      break; // Persecución directa de la celda de Pacman.
    case 'ambusher': {
      const d = DIRS[ p.dir ];
      targetX = px + 4 * d.x;
      targetY = py + 4 * d.y;
      break;
    }
    case 'flanker': {
      const d = DIRS[ p.dir ];
      const hunter = game.ghosts.find( ( ghost ) => ghost.kind === 'hunter' );
      const p2x = px + 2 * d.x;
      const p2y = py + 2 * d.y;
      targetX = p2x + ( p2x - hunter.x );
      targetY = p2y + ( p2y - hunter.y );
      break;
    }
    case 'wanderer':
      flee = Math.abs( g.x - px ) + Math.abs( g.y - py ) < 8;
      break;
  }

  if ( g.mode !== 'frightened' && ( g.kind === 'ambusher' || g.kind === 'flanker' ) ) {
    targetX = Math.max( 0, Math.min( grid[ 0 ].length - 1, targetX ) );
    targetY = Math.max( 0, Math.min( grid.length - 1, targetY ) );
  }

  let best = choices[ 0 ];
  let bestDist = flee ? -Infinity : Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    const nx = g.x + d.x;
    const ny = g.y + d.y;
    const dist = Math.abs( nx - targetX ) + Math.abs( ny - targetY );
    if ( flee ? dist > bestDist : dist < bestDist ) {
      bestDist = dist;
      best = dir;
    }
  }
  g.dir = best;
}

// Búsqueda en anchura: ruta mínima por celdas, con origen y destino incluidos.
// No depende de la dirección previa: los ojos pueden invertir la marcha.
function findGhostPath( grid, start, target = { x: 13, y: 14 } ) {
  if ( isWall( grid, start.x, start.y, 'ghost' ) ||
    isWall( grid, target.x, target.y, 'ghost' ) ) return [];

  const width = grid[ 0 ].length;
  const first = { x: start.x, y: start.y, parent: null };
  const queue = [ first ];
  const visited = new Set( [ first.y * width + first.x ] );

  for ( let head = 0; head < queue.length; head++ ) {
    const current = queue[ head ];
    if ( current.x === target.x && current.y === target.y ) {
      const path = [];
      for ( let cell = current; cell !== null; cell = cell.parent ) {
        path.push( { x: cell.x, y: cell.y } );
      }
      return path.reverse();
    }

    for ( const dir of Object.keys( DIRS ) ) {
      if ( !canMove( grid, current.x, current.y, dir, 'ghost' ) ) continue;
      const d = DIRS[ dir ];
      // canMove solo permite cruzar los bordes en la fila del túnel.
      const x = ( current.x + d.x + width ) % width;
      const y = current.y + d.y;
      const key = y * width + x;
      if ( visited.has( key ) ) continue;
      visited.add( key );
      queue.push( { x, y, parent: current } );
    }
  }
  return []; // No existe conexión con el destino.
}

function decideEyes( game, g ) {
  const path = findGhostPath( game.grid, g );
  if ( path.length < 2 ) return false;
  const next = path[ 1 ];
  const width = game.grid[ 0 ].length;
  // Comparar vecinos con wrap conserva la dirección correcta en el túnel.
  g.dir = Object.keys( DIRS ).find( ( dir ) => {
    const d = DIRS[ dir ];
    return ( g.x + d.x + width ) % width === next.x && g.y + d.y === next.y;
  } );
  return true;
}

function moveGhost( game, g ) {
  if ( !g.released && game.dotsEaten >= EXIT_DOTS[ g.kind ] ) {
    g.released = true;
  }
  if ( g.released === false ) return;

  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( g.x ) && aligned( g.y ) ) {
    // Normalizar también el redondeo junto al borde del túnel.
    g.x = ( Math.round( g.x ) + width ) % width;
    g.y = Math.round( g.y );
    if ( g.mode === 'eyes' && g.x === 13 && g.y === 14 ) {
      g.mode = 'normal';
      g.reversePending = false;
      g.released = true;
    }
    // Mantener la velocidad del segmento hasta alcanzar una celda alineada.
    g.speed = g.mode === 'eyes' ? EYES_SPEED :
      ( g.mode === 'frightened' ? FRIGHTENED_SPEED : GHOST_SPEED );
    if ( g.mode === 'eyes' ) {
      // El regreso tiene prioridad sobre la salida y permite giros de 180 grados.
      if ( !decideEyes( game, g ) ) return;
    } else if ( isInPenPassage( g ) ) {
      // Salir de la pen por la columna 13, incluida la puerta en la fila 12.
      g.reversePending = false;
      if ( g.x < 13 ) g.dir = 'right';
      else if ( g.x > 13 ) g.dir = 'left';
      else g.dir = 'up';
    } else if ( g.reversePending ) {
      g.reversePending = false;
      g.dir = OPPOSITE[ g.dir ];
    } else {
      decideGhost( game, g );
    }
    if ( !canMove( grid, g.x, g.y, g.dir, 'ghost' ) ) return;
  }

  const d = DIRS[ g.dir ];
  g.x += d.x * g.speed;
  g.y += d.y * g.speed;
  wrapTunnel( g, width );
}

function resetPositions( game ) {
  // La vida nueva conserva el laberinto, la puntuación y los desbloqueos.
  game.frightenedRemainingMs = 0;
  game.ghostsEatenChain = 0;
  game.eatPauseRemainingMs = 0;
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  p.speed = PACMAN_SPEED;
  game.ghosts.forEach( ( g, i ) => {
    g.x = GHOST_STARTS[ i ].x;
    g.y = GHOST_STARTS[ i ].y;
    g.dir = 'up';
    g.mode = 'normal';
    g.reversePending = false;
    g.speed = GHOST_SPEED;
  } );
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

// deltaMs mide tiempo de juego; el movimiento sigue siendo por actualización.
function update( game, deltaMs = 0 ) {
  if ( game.eatPauseRemainingMs > 0 ) {
    const pausedMs = Math.min( deltaMs, game.eatPauseRemainingMs );
    game.eatPauseRemainingMs -= pausedMs;
    deltaMs -= pausedMs;
    // La parte pausada no mueve actores, procesa contactos ni consume miedo.
    if ( game.eatPauseRemainingMs > 0 || deltaMs <= 0 ) return;
  }
  // Descontar antes del consumo permite que cada PP renueve los 6 segundos completos.
  updateFrightened( game, deltaMs );
  movePacman( game );
  game.ghosts.forEach( ( g ) => moveGhost( game, g ) );

  for ( const g of game.ghosts ) {
    if ( g.mode === 'eyes' ) continue;
    if ( collides( game.pacman, g ) ) {
      if ( g.mode === 'frightened' ) {
        game.score += 200 * ( 2 ** Math.min( game.ghostsEatenChain, 3 ) );
        game.ghostsEatenChain++;
        g.mode = 'eyes';
        g.reversePending = false;
        game.eatPauseRemainingMs = EAT_PAUSE_DURATION_MS;
        // Una sola captura por actualización; el render ya mostrará sus ojos.
        return;
      }
      game.lives--;
      resetPositions( game );
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
window.findGhostPath = findGhostPath;
