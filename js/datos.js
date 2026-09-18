/*
 * MOTOR DE DATOS
 * -----------------------------------------------------------------
 * Jerarquia de los datos: Anio -> Mes -> Jornada (ej. "Fecha 01") -> Partida (ej. 1, 2...)
 * Una Jornada NO es una fecha de calendario -- es un nombre/numero de sesion
 * que tu defines (puede jugarse en mas de un dia real, no importa).
 *
 * Toda la app lee de un unico archivo: data/data.json. No se usa localStorage
 * como fuente de verdad en ningun momento.
 *
 * Estructura esperada de data.json:
 * {
 *   "equivalencias": [ { "antiguo": "kficho", "oficial": "[cLm] KFICHO" }, ... ],
 *   "partidas": [
 *     {
 *       "id": "2026-08-Fecha01-P1",
 *       "anio": 2026,
 *       "mes": "08",
 *       "jornada": "Fecha 01",
 *       "numeroPartida": 1,
 *       "duracionSeg": 4020,
 *       "jugadores": [
 *         { "nombre": "GJ Euphory", "resultado": "victoria", "civ": "Mayas",
 *           "equipo": "Equipo 1", "unidadesAsesinadas": 3700, "edificiosArrasados": 119,
 *           "bonos": ["E","M"] }
 *       ]
 *     }
 *   ],
 *   "jornadasImagenes": [
 *     {
 *       "anio": 2026, "mes": "09", "jornada": "Fecha 05",
 *       "imagenEvaluacion": "imagenes/candidatos_2026-09_fecha05.png",
 *       "imagenGalardon": "imagenes/galardon_2026-09_fecha05.png"
 *     }
 *   ]
 * }
 */

const RUTA_DATOS = "data/data.json";

const NOMBRES_MES = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
  "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
  "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre"
};

const ETIQUETAS_BONO = {
  E: "Excelencia", R: "Resistencia", M: "Militar", O: "Oro",
  S: "Sociedad", Rch: "Racha", MG: "Matagigantes", RLP: "Relampago"
};

const BONOS_SIMPLES = ["E", "R", "M", "O", "S"]; // suman 1 punto automatico cada uno (Rch ahora se calcula solo, por racha)
const BONOS_METODOLOGIA_APARTE = ["MG", "RLP"]; // su puntaje se calcula fuera y se ingresa manualmente en "puntosBonoExtra"

/** Calcula los puntos totales que un jugador ganó en UN registro/partida específico. */
function puntosDeRegistro(registro) {
  if (!registro) return 0;
  const base = registro.resultado === "victoria" ? 3 : 0;
  const bonosSimples = (registro.bonos || []).filter(b => BONOS_SIMPLES.includes(b)).length;
  return base + bonosSimples + (registro.puntosBonoExtra || 0);
}

async function cargarDatos() {
  try {
    const resp = await fetch(`${RUTA_DATOS}?t=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) throw new Error("No se pudo leer data.json");
    const json = await resp.json();
    const equivalencias = Array.isArray(json.equivalencias) ? json.equivalencias : [];
    const civEquivalencias = Array.isArray(json.civEquivalencias) ? json.civEquivalencias : [];
    let partidasCrudas = Array.isArray(json.partidas) ? json.partidas : [];
    partidasCrudas = normalizarCivsEnPartidas(partidasCrudas, civEquivalencias);
    const partidas = prepararPartidasConBonosAutomaticos(partidasCrudas, equivalencias);
    // jugadoresInfo: { "Nombre Oficial": { pais: "PE", civFavorita: "Mayas" } }
    // Mantiene compatibilidad con el campo antiguo 'paises' (solo país) por si existiera.
    let jugadoresInfo = {};
    if (json.jugadoresInfo && typeof json.jugadoresInfo === "object") {
      jugadoresInfo = json.jugadoresInfo;
    } else if (json.paises && typeof json.paises === "object") {
      Object.entries(json.paises).forEach(([nombre, pais]) => {
        jugadoresInfo[nombre] = { pais, civFavorita: "" };
      });
    }
    const jornadasImagenes = Array.isArray(json.jornadasImagenes) ? json.jornadasImagenes : [];
    return { equivalencias, civEquivalencias, partidas, jugadoresInfo, jornadasImagenes };
  } catch (e) {
    console.error("Error cargando datos:", e);
    return { equivalencias: [], civEquivalencias: [], partidas: [], jugadoresInfo: {}, jornadasImagenes: [] };
  }
}

/** Clave única para identificar una Fecha/Jornada dentro de un Año/Mes específico. */
function claveJornada(anio, mes, jornada) {
  return `${anio}-${String(mes).padStart(2, "0")}-${jornada}`;
}

/** Sugiere nombres de archivo para las imágenes de Candidatos de una Fecha, siguiendo el patrón candidatos_AAAA-MM_fechaNN.png / galardon_AAAA-MM_fechaNN.png */
function sugerirNombresImagenes(anio, mes, jornadaTexto) {
  const mesStr = String(mes).padStart(2, "0");
  const numJor = numeroDeJornada(jornadaTexto);
  const jorStr = String(numJor).padStart(2, "0");
  const base = `${anio}-${mesStr}_fecha${jorStr}`;
  return {
    evaluacion: `imagenes/candidatos_${base}.png`,
    galardon: `imagenes/galardon_${base}.png`
  };
}

function resolverNombreOficial(nombreCrudo, equivalencias) {
  if (!nombreCrudo) return "";
  const limpio = nombreCrudo.toLowerCase().trim();
  const exacto = equivalencias.find(e => e.antiguo.toLowerCase() === limpio);
  if (exacto) return exacto.oficial;
  return nombreCrudo.trim();
}

function formatearDuracion(segundos) {
  if (!segundos || segundos <= 0) return "00:00";
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:00`
    : `${String(m).padStart(2, "0")} min`;
}

/** Extrae el numero dentro de un texto tipo "Fecha 01" -> 1. */
function numeroDeJornada(jornadaTexto) {
  const m = (jornadaTexto || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

/** Clave numerica de orden cronologico: anio, mes, jornada, partida. */
function claveOrden(p) {
  return (p.anio || 0) * 1e6
       + parseInt(p.mes || "0", 10) * 1e4
       + numeroDeJornada(p.jornada) * 1e2
       + (p.numeroPartida || 0);
}

/** Clave "AAAA-MM" para agrupar/filtrar por periodo. */
function clavePeriodo(p) {
  return `${p.anio}-${String(p.mes).padStart(2, "0")}`;
}

function nombrePeriodo(clave) {
  const [a, m] = clave.split("-");
  return `${NOMBRES_MES[m] || m} ${a}`;
}

/** Etiqueta legible: "Fecha 01 . Partida 1". */
function etiquetaPartida(p) {
  return `${p.jornada || "Fecha ?"} · Partida ${p.numeroPartida ?? "?"}`;
}

/**
 * Calcula el objeto de estadisticas acumuladas por jugador a partir
 * de la lista cruda de partidas. Aplica resolucion de nombres.
 */
function calcularEstadisticasJugadores(partidas, equivalencias) {
  const mapa = {};

  function obtenerFicha(nombre) {
    if (!mapa[nombre]) {
      mapa[nombre] = {
        nombre,
        partidas: 0,
        victorias: 0,
        derrotas: 0,
        puntos: 0,
        unidadesAsesinadas: 0,
        edificiosArrasados: 0,
        segundosTotales: 0,
        civs: {},
        ultimaPartida: null
      };
    }
    return mapa[nombre];
  }

  partidas.forEach(partida => {
    (partida.jugadores || []).forEach(j => {
      const nombre = resolverNombreOficial(j.nombre, equivalencias);
      const ficha = obtenerFicha(nombre);
      const gano = j.resultado === "victoria";

      ficha.partidas++;
      if (gano) ficha.victorias++; else ficha.derrotas++;
      const bonosSimplesGanados = (j.bonos || []).filter(b => BONOS_SIMPLES.includes(b)).length;
      ficha.puntos += (j.puntos ?? (gano ? 3 : 0)) + bonosSimplesGanados + (j.puntosBonoExtra || 0);
      ficha.unidadesAsesinadas += j.unidadesAsesinadas || 0;
      ficha.edificiosArrasados += j.edificiosArrasados || 0;
      ficha.segundosTotales += partida.duracionSeg || 0;

      if (j.civ) {
        if (!ficha.civs[j.civ]) ficha.civs[j.civ] = { jugadas: 0, victorias: 0 };
        ficha.civs[j.civ].jugadas++;
        if (gano) ficha.civs[j.civ].victorias++;
      }

      if (!ficha.ultimaPartida || claveOrden(partida) > claveOrden(ficha.ultimaPartida)) {
        ficha.ultimaPartida = partida;
      }
    });
  });

  return mapa;
}

/** Devuelve el historial de partidas de un jugador, mas recientes primero. */
function historialDeJugador(nombreOficial, partidas, equivalencias) {
  const resultado = [];
  partidas.forEach(partida => {
    const registro = (partida.jugadores || []).find(
      j => resolverNombreOficial(j.nombre, equivalencias) === nombreOficial
    );
    if (registro) resultado.push({ partida, registro });
  });
  return resultado.sort((a, b) => claveOrden(b.partida) - claveOrden(a.partida));
}

/** Lista de todos los nombres oficiales conocidos (para autocompletar). */
function listaDeNombresOficiales(partidas, equivalencias) {
  const set = new Set();
  partidas.forEach(p => (p.jugadores || []).forEach(j => {
    set.add(resolverNombreOficial(j.nombre, equivalencias));
  }));
  equivalencias.forEach(e => set.add(e.oficial));
  return [...set].sort();
}

/**
 * Calcula estadisticas conjuntas (sinergia) para un grupo de 2 a 4 jugadores:
 * cuantas partidas jugaron juntos en el mismo equipo, y con que efectividad.
 */
function calcularSinergia(nombresSeleccionados, partidas, equivalencias) {
  let juntos = 0, victorias = 0, derrotas = 0;

  partidas.forEach(partida => {
    const registros = (partida.jugadores || []).map(j => ({
      ...j,
      nombreOficial: resolverNombreOficial(j.nombre, equivalencias)
    }));
    const presentes = nombresSeleccionados.every(n =>
      registros.some(r => r.nombreOficial === n)
    );
    if (!presentes) return;

    const seleccionados = registros.filter(r => nombresSeleccionados.includes(r.nombreOficial));
    const primerEquipo = seleccionados[0].equipo;
    const mismoEquipo = primerEquipo && seleccionados.every(r => r.equipo === primerEquipo);
    const todosGanaron = seleccionados.every(r => r.resultado === "victoria");
    const todosPerdieron = seleccionados.every(r => r.resultado === "derrota");

    if (mismoEquipo || todosGanaron) { juntos++; victorias++; }
    else if (todosPerdieron) { juntos++; derrotas++; }
  });

  return {
    partidasJuntos: juntos,
    victorias,
    derrotas,
    efectividad: juntos > 0 ? Math.round((victorias / juntos) * 100) : 0
  };
}

/** Compara 2 a 4 jugadores lado a lado: tiempos, unidades, edificios. */
function compararJugadores(nombres, partidas, equivalencias) {
  const stats = calcularEstadisticasJugadores(partidas, equivalencias);
  return nombres.map(n => stats[n] || {
    nombre: n, partidas: 0, victorias: 0, derrotas: 0, puntos: 0,
    unidadesAsesinadas: 0, edificiosArrasados: 0, segundosTotales: 0, civs: {}
  });
}

/**
 * Calcula, para una secuencia de partidas de un mismo periodo (ya ordenadas
 * ASCENDENTE por claveOrden), cuanto vario la posicion de cada jugador en la
 * tabla de posiciones jornada por jornada (agrupando las partidas de cada
 * jornada como un solo "salto"). Devuelve: { [jornada]: { [nombre]: variacion } }
 */
function calcularVarPorJornada(partidasOrdenadasAsc, equivalencias) {
  const grupos = [];
  partidasOrdenadasAsc.forEach(p => {
    let g = grupos.find(g => g.jornada === p.jornada);
    if (!g) { g = { jornada: p.jornada, partidas: [] }; grupos.push(g); }
    g.partidas.push(p);
  });

  const resultado = {};
  let acumulado = [];

  grupos.forEach(g => {
    const rankingAntes = Object.values(calcularEstadisticasJugadores(acumulado, equivalencias))
      .sort((a, b) => b.puntos - a.puntos);
    const posAntesMap = {};
    rankingAntes.forEach((j, i) => posAntesMap[j.nombre] = i + 1);
    const totalAntes = rankingAntes.length;
    const esPrimeraJornadaConDatos = totalAntes === 0;

    acumulado = [...acumulado, ...g.partidas];

    const rankingDespues = Object.values(calcularEstadisticasJugadores(acumulado, equivalencias))
      .sort((a, b) => b.puntos - a.puntos);
    const posDespuesMap = {};
    rankingDespues.forEach((j, i) => posDespuesMap[j.nombre] = i + 1);

    const vars = {};
    Object.keys(posDespuesMap).forEach(nombre => {
      if (esPrimeraJornadaConDatos) {
        // Nadie tenía posición previa en la tabla: variación neutra para todos.
        vars[nombre] = 0;
      } else {
        const posAntes = posAntesMap[nombre] !== undefined ? posAntesMap[nombre] : totalAntes + 1;
        vars[nombre] = posAntes - posDespuesMap[nombre];
      }
    });
    resultado[g.jornada] = vars;
  });

  return resultado;
}

/**
 * Igual que calcularVarPorJornada, pero el "salto" se calcula partida por
 * partida en vez de jornada por jornada. Devuelve: { [idPartida]: { [nombre]: variacion } }
 */
function calcularVarPorPartida(partidasOrdenadasAsc, equivalencias) {
  const resultado = {};
  let acumulado = [];

  partidasOrdenadasAsc.forEach(p => {
    const rankingAntes = Object.values(calcularEstadisticasJugadores(acumulado, equivalencias))
      .sort((a, b) => b.puntos - a.puntos);
    const posAntesMap = {};
    rankingAntes.forEach((j, i) => posAntesMap[j.nombre] = i + 1);
    const totalAntes = rankingAntes.length;
    const esPrimeraPartidaConDatos = totalAntes === 0;

    acumulado = [...acumulado, p];

    const rankingDespues = Object.values(calcularEstadisticasJugadores(acumulado, equivalencias))
      .sort((a, b) => b.puntos - a.puntos);
    const posDespuesMap = {};
    rankingDespues.forEach((j, i) => posDespuesMap[j.nombre] = i + 1);

    const vars = {};
    (p.jugadores || []).forEach(j => {
      const nombre = resolverNombreOficial(j.nombre, equivalencias);
      if (esPrimeraPartidaConDatos) {
        vars[nombre] = 0;
      } else {
        const posDespues = posDespuesMap[nombre];
        const posAntes = posAntesMap[nombre] !== undefined ? posAntesMap[nombre] : totalAntes + 1;
        vars[nombre] = posAntes - posDespues;
      }
    });
    resultado[p.id] = vars;
  });

  return resultado;
}

/**
 * Arma la tabla de clasificacion detallada (columnas de bonos, ultimo suceso,
 * V/D, TB, variacion) para un Año/Mes dado, opcionalmente acotado hasta una
 * Jornada especifica (si jornadaFiltro es null/"" se usa el mes completo).
 */
function calcularTablaClasificacion(todasLasPartidas, equivalencias, anio, mes, jornadaFiltro) {
  const delPeriodo = todasLasPartidas
    .filter(p => p.anio == anio && String(p.mes).padStart(2, "0") === String(mes).padStart(2, "0"))
    .sort((a, b) => claveOrden(a) - claveOrden(b));

  const jornadasDisponibles = [...new Set(delPeriodo.map(p => p.jornada))]
    .sort((a, b) => numeroDeJornada(a) - numeroDeJornada(b));

  const jornadaLimite = jornadaFiltro || (jornadasDisponibles[jornadasDisponibles.length - 1] || null);

  const enAlcance = jornadaLimite
    ? delPeriodo.filter(p => numeroDeJornada(p.jornada) <= numeroDeJornada(jornadaLimite))
    : delPeriodo;

  const varPorJornada = calcularVarPorJornada(delPeriodo, equivalencias);
  const varDeEstaJornada = jornadaLimite ? (varPorJornada[jornadaLimite] || {}) : {};

  const ultimaPartidaEnAlcance = enAlcance.length > 0
    ? enAlcance.reduce((a, b) => claveOrden(b) > claveOrden(a) ? b : a)
    : null;

  const stats = calcularEstadisticasJugadores(enAlcance, equivalencias);

  const filas = Object.values(stats).map(j => {
    const registroUltima = ultimaPartidaEnAlcance
      ? (ultimaPartidaEnAlcance.jugadores || []).find(x => resolverNombreOficial(x.nombre, equivalencias) === j.nombre)
      : null;

    const bonos = { E: 0, R: 0, M: 0, O: 0, S: 0, Rch: 0, MG: 0, RLP: 0 };
    enAlcance.forEach(p => {
      const reg = (p.jugadores || []).find(x => resolverNombreOficial(x.nombre, equivalencias) === j.nombre);
      if (reg) (reg.bonos || []).forEach(b => {
        const base = b.replace(/\d+$/, ""); // "MG2" -> "MG", "E" -> "E"
        if (bonos[base] !== undefined) bonos[base]++;
      });
    });
    const tb = Object.values(bonos).reduce((a, b) => a + b, 0);

    return {
      nombre: j.nombre,
      puntos: j.puntos,
      victorias: j.victorias,
      derrotas: j.derrotas,
      partidas: j.partidas,
      ultimoSuceso: registroUltima
        ? `${[registroUltima.resultado === "victoria" ? "Victoria" : "Derrota", ...(registroUltima.bonos || [])].join(" + ")} (${puntosDeRegistro(registroUltima)} pts)`
        : "Sin participación",
      vd: registroUltima ? (registroUltima.resultado === "victoria" ? 1 : 0) : 0,
      bonos,
      tb,
      variacion: varDeEstaJornada[j.nombre] ?? 0
    };
  })
  .filter(f => f.partidas > 0 && f.puntos > 0)
  .sort((a, b) => b.puntos - a.puntos)
  .slice(0, 25);

  return {
    filas,
    jornadasDisponibles,
    jornadaMostrada: jornadaLimite,
    ultimaPartida: ultimaPartidaEnAlcance,
    totalPartidas: enAlcance.length
  };
}

/**
 * Calcula automaticamente los bonos Matagigantes (MG) y Relampago (RLP) para
 * TODAS las partidas de un mismo Anio/Mes, procesandolas en orden cronologico
 * y usando la posicion en la tabla justo ANTES de cada partida.
 *
 * Reglas:
 * - RLP: partida con duracion < 60:00. Gana cualquier ganador. Puntos segun
 *   SU posicion antes de la partida: 1-10 -> 1pt, 11-15 -> 2pt, 16+ -> 3pt.
 * - MG: solo activo desde "Fecha 06" en adelante. "Gigante" = top 5 antes de
 *   la partida. Se activa si algun perdedor era gigante. Lo reciben los
 *   ganadores que NO son gigantes (posicion > 5), con los mismos tramos de
 *   puntos que RLP pero arrancando en la posicion 6 (6-10 -> 1pt, 11-15 -> 2pt,
 *   16+ -> 3pt). Los que ya estan en el top 5 nunca reciben MG.
 *
 * Devuelve un NUEVO arreglo de partidas (no muta el original) con cada
 * jugador ya anotado con sus bonos MG/RLP agregados a `bonos` y su puntaje
 * correspondiente sumado a `puntosBonoExtra`.
 */
function tramoDePuntos(posicion, limites) {
  for (const [limite, pts] of limites) {
    if (limite === null || posicion <= limite) return pts;
  }
  return 0;
}

function calcularBonosAutomaticosDelMes(partidasDelMesAsc, equivalencias) {
  let acumulado = [];
  const resultado = [];
  const ultimoResultadoPorJugador = {}; // nombre oficial -> "victoria" | "derrota"

  partidasDelMesAsc.forEach(original => {
    const rankingAntes = Object.values(calcularEstadisticasJugadores(acumulado, equivalencias))
      .sort((a, b) => b.puntos - a.puntos);
    const posAntesMap = {};
    rankingAntes.forEach((j, i) => posAntesMap[j.nombre] = i + 1);
    const totalAntes = rankingAntes.length;
    const posicionDe = nombre => posAntesMap[nombre] !== undefined ? posAntesMap[nombre] : totalAntes + 1;

    const jugadoresAnotados = (original.jugadores || []).map(j => ({ ...j, bonos: [...(j.bonos || [])] }));
    const resueltos = jugadoresAnotados.map(j => ({ ref: j, nombreOficial: resolverNombreOficial(j.nombre, equivalencias) }));

    // Racha: se activa cuando la victoria actual viene INMEDIATAMENTE después de otra
    // victoria del mismo jugador (su partida previa, sin importar jornada). Una derrota
    // rompe la racha; la siguiente victoria después de una derrota no cuenta, pero deja
    // habilitado el bono para la que sigue si vuelve a ganar.
    resueltos.forEach(r => {
      const anterior = ultimoResultadoPorJugador[r.nombreOficial];
      if (r.ref.resultado === "victoria" && anterior === "victoria") {
        r.ref.bonos.push("Rch");
        r.ref.puntosBonoExtra = (r.ref.puntosBonoExtra || 0) + 1;
      }
      ultimoResultadoPorJugador[r.nombreOficial] = r.ref.resultado;
    });

    const ganadores = resueltos.filter(r => r.ref.resultado === "victoria");
    const perdedores = resueltos.filter(r => r.ref.resultado === "derrota");

    const numJornada = numeroDeJornada(original.jornada);
    const huboGiganteEntreLosPerdedores = perdedores.some(r => posicionDe(r.nombreOficial) <= 5);
    const duracionValidaRelampago = original.duracionSeg > 0 && original.duracionSeg < 3600;

    ganadores.forEach(r => {
      const pos = posicionDe(r.nombreOficial);
      let extra = 0;

      if (duracionValidaRelampago) {
        const pts = tramoDePuntos(pos, [[10, 1], [15, 2], [null, 3]]);
        extra += pts;
        r.ref.bonos.push(`RLP${pts}`);
      }
      if (numJornada >= 6 && huboGiganteEntreLosPerdedores && pos > 5) {
        const pts = tramoDePuntos(pos, [[10, 1], [15, 2], [null, 3]]);
        extra += pts;
        r.ref.bonos.push(`MG${pts}`);
      }
      r.ref.puntosBonoExtra = (r.ref.puntosBonoExtra || 0) + extra;
    });

    const nuevaPartida = { ...original, jugadores: jugadoresAnotados };
    resultado.push(nuevaPartida);
    acumulado = [...acumulado, nuevaPartida];
  });

  return resultado;
}

/** Aplica el calculo automatico de MG/RLP mes por mes sobre TODAS las partidas cargadas. */
function prepararPartidasConBonosAutomaticos(todasLasPartidas, equivalencias) {
  const grupos = {};
  todasLasPartidas.forEach(p => {
    const clave = clavePeriodo(p);
    if (!grupos[clave]) grupos[clave] = [];
    grupos[clave].push(p);
  });

  let resultado = [];
  Object.values(grupos).forEach(partidasDelMes => {
    const ordenadas = [...partidasDelMes].sort((a, b) => claveOrden(a) - claveOrden(b));
    resultado = resultado.concat(calcularBonosAutomaticosDelMes(ordenadas, equivalencias));
  });
  return resultado;
}

/** Convierte un código de país de 2 letras (ISO 3166-1 alpha-2, ej. "PE", "AR") en su emoji de bandera. */
function banderaEmoji(codigoPais) {
  if (!codigoPais || codigoPais.length !== 2) return "";
  const base = 127397; // offset para regional indicator symbols
  return String.fromCodePoint(...codigoPais.toUpperCase().split("").map(c => c.charCodeAt(0) + base));
}

function resolverCivOficial(civCruda, civEquivalencias) {
  if (!civCruda) return civCruda;
  const limpio = civCruda.toLowerCase().trim();
  const exacto = (civEquivalencias || []).find(e => e.antiguo.toLowerCase() === limpio);
  return exacto ? exacto.oficial : civCruda.trim();
}

/** Aplica la correccion de civilizaciones a todas las partidas (no muta el original). */
function normalizarCivsEnPartidas(partidas, civEquivalencias) {
  if (!civEquivalencias || civEquivalencias.length === 0) return partidas;
  return partidas.map(p => ({
    ...p,
    jugadores: (p.jugadores || []).map(j => ({
      ...j,
      civ: resolverCivOficial(j.civ, civEquivalencias)
    }))
  }));
}

/** Clave de orden cronologico para un objeto {anio, mes, jornada} (sin partida). */
function claveOrdenJornadaObj(o) {
  return (o.anio || 0) * 1e6 + parseInt(o.mes || "0", 10) * 1e4 + numeroDeJornada(o.jornada) * 1e2;
}

/** Etiqueta legible: "Fecha 05 . Septiembre 2026" */
function etiquetaJornadaObj(o) {
  return `${o.jornada} · ${NOMBRES_MES[String(o.mes).padStart(2,"0")] || o.mes} ${o.anio}`;
}

/** Nombre de archivo sugerido para las imagenes de una Fecha (Año/Mes/Jornada). */
function sugerirNombresImagenFecha(anio, mes, jornada) {
  const mesPad = String(mes).padStart(2, "0");
  const numJor = numeroDeJornada(jornada);
  const jorPad = String(numJor).padStart(2, "0");
  return {
    evaluacion: `imagenes/candidatos_${anio}-${mesPad}_fecha${jorPad}.png`,
    galardon: `imagenes/galardon_${anio}-${mesPad}_fecha${jorPad}.png`
  };
}

/** Clave numerica de orden para una jornada (sin partida): anio, mes, jornada. */
function claveOrdenJornada(j) {
  return (j.anio || 0) * 1e4 + parseInt(j.mes || "0", 10) * 1e2 + numeroDeJornada(j.jornada);
}

/** Nombre de archivo sugerido (sin ruta) para las imagenes de una Fecha. */
function nombreSugeridoImagenFecha(anio, mes, jornada, tipo) {
  const numJor = numeroDeJornada(jornada);
  const mesPad = String(mes).padStart(2, "0");
  const jorPad = String(numJor).padStart(2, "0");
  return `imagenes/${tipo}_${anio}-${mesPad}_fecha${jorPad}.png`;
}

/**
 * Descarga como imagen un elemento que puede contener tablas con scroll
 * horizontal (overflow-x: auto). Expande temporalmente esos contenedores a
 * su ancho completo antes de capturar con html2canvas (que de otra forma
 * solo capturaría la porcion visible en pantallas angostas como el celular),
 * y los devuelve a su estado normal apenas termina.
 */
function descargarElementoComoImagen(elemento, nombreArchivo, backgroundColor) {
  const scrollables = elemento.querySelectorAll('[style*="overflow-x"]');
  const estilosOriginales = [];
  scrollables.forEach(sc => {
    estilosOriginales.push({ el: sc, overflowX: sc.style.overflowX, width: sc.style.width });
    sc.style.overflowX = "visible";
    sc.style.width = "max-content";
  });

  const restaurar = () => {
    estilosOriginales.forEach(o => {
      o.el.style.overflowX = o.overflowX;
      o.el.style.width = o.width;
    });
  };

  html2canvas(elemento, { backgroundColor, scale: 2 }).then(canvas => {
    restaurar();
    const enlace = document.createElement("a");
    enlace.href = canvas.toDataURL("image/png");
    enlace.download = nombreArchivo;
    enlace.click();
  }).catch(err => {
    restaurar();
    console.error("Error generando la imagen:", err);
  });
}
