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
 *       "jugadorDestacado": "GJ Euphory",
 *       "imagenEvaluacion": "imagenes/....jpg",
 *       "imagenGalardon": "imagenes/....jpg",
 *       "jugadores": [
 *         { "nombre": "GJ Euphory", "resultado": "victoria", "civ": "Mayas",
 *           "equipo": "Equipo 1", "unidadesAsesinadas": 3700, "edificiosArrasados": 119,
 *           "bonos": ["E","M"] }
 *       ]
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

async function cargarDatos() {
  try {
    const resp = await fetch(`${RUTA_DATOS}?t=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) throw new Error("No se pudo leer data.json");
    const json = await resp.json();
    return {
      equivalencias: Array.isArray(json.equivalencias) ? json.equivalencias : [],
      partidas: Array.isArray(json.partidas) ? json.partidas : []
    };
  } catch (e) {
    console.error("Error cargando datos:", e);
    return { equivalencias: [], partidas: [] };
  }
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
      ficha.puntos += (j.puntos ?? (gano ? 3 : 0)) + (j.bonos ? j.bonos.length : 0);
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
