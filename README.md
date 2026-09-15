# Comunidad AoE II — Estadísticas

Sitio estático (HTML/CSS/JS puro), pensado para publicarse en GitHub Pages.

## Cómo funciona

Toda la información vive en un único archivo: `data/data.json`. No se usa
`localStorage` como fuente de verdad — así se evita el problema de que los
datos se vean distintos en cada dispositivo o se sobrescriban solos.

## Jerarquía de los datos

**Año → Mes → Jornada (ej. "Fecha 01") → Partida (ej. 1, 2...)**

Una Jornada NO es una fecha de calendario — es un nombre/número de sesión que tú
defines libremente (puede jugarse en uno o varios días reales, no importa). Cada
Jornada puede tener una o más Partidas.

## Flujo de trabajo para registrar partidas

1. Abre `admin.html`.
2. Haz clic en **"Cargar data.json publicado"** para traer el historial actual.
3. Pega el reporte de la partida en el formato:
   ```
   anio: 2026
   mes: 08
   jornada: Fecha 02
   partida: 1
   duracion: 01:07:00
   Jugador | victoria|derrota | Civilización | Equipo | UnidadesAsesinadas | EdificiosArrasados | Bonos
   ```
4. Clic en **"Agregar esta partida"** (puedes agregar varias antes de descargar).
5. Clic en **"Descargar data.json actualizado"**.
6. Sube ese archivo a GitHub, reemplazando `data/data.json`.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub.
2. Sube todos estos archivos y carpetas (`index.html`, `jugador.html`,
   `admin.html`, `css/`, `js/`, `data/`, este `README.md`).
3. Ve a Settings → Pages → selecciona la rama `main` y carpeta `/ (root)`.
4. Tu sitio quedará disponible en `https://TU-USUARIO.github.io/TU-REPO/`.

## Estructura de archivos

```
index.html          → Clasificación general (página de inicio)
jugador.html        → Perfil individual de cada jugador
estadisticas.html   → Comparativas: Tiempos, Civs/WR, Sinergia (2-4 jugadores)
candidatos.html     → Galería de imágenes "Jugador de la Fecha" por jornada
historial.html      → Listado de partidas filtrable por mes, con detalle de bonos
admin.html          → Panel para cargar partidas, corregir nombres, gestionar jornadas
css/estilo.css      → Estilos compartidos
js/datos.js         → Lógica compartida de carga y cálculo de estadísticas
data/data.json      → Los datos reales del torneo (la única fuente de verdad)
imagenes/           → Fotos/infografías de "Jugador de la Fecha" (subidas manualmente)
```

## Cómo subir las imágenes de Candidatos (por partida)

Cada partida puede tener **2 imágenes**: la de **evaluación** (candidatos que aspiraban al
galardón) y la del **galardón** (quien lo ganó).

1. Sube ambas imágenes directamente a la carpeta `imagenes/` en GitHub (Add file → Upload
   files). Anota los nombres exactos, ej: `imagenes/2026-08-16-evaluacion.jpg` y
   `imagenes/2026-08-16-galardon.jpg`.
2. Ve a `admin.html`, sección ⑤, selecciona la partida correspondiente en el desplegable,
   y pega el jugador destacado y los nombres de archivo de ambas imágenes.
3. Descarga y sube el `data.json` actualizado como siempre.

La pestaña "Candidatos" solo muestra las **últimas 5 fechas (máximo 10 partidas)** con
imágenes cargadas, para no volverse una lista interminable.

## Corrección de nombres (nicks alternos)

En `admin.html` puedes vincular cualquier cantidad de nombres antiguos/mal escritos a un
mismo nick oficial. Por ejemplo, si "Pako", "pako123" y "P@KO" son la misma persona, agrega
tres entradas distintas, todas apuntando al mismo "Nick oficial". No hay límite de cuántos
alias puede tener un jugador.

## Eliminar una partida mal ingresada

En `admin.html`, sección ③, verás la lista de partidas cargadas con un botón 🗑 para
eliminar cualquiera antes de descargar y publicar el archivo final.


## Sistema de puntos

- **Victoria** = 3 puntos.
- **E, R, M, O, S** (Excelencia, Resistencia, Militar, Oro, Sociedad) = 1 punto cada uno.
  Estos los escribes tú mismo en el campo "Bonos" al registrar la partida.
- **Rch (Racha)**, **MG (Matagigantes)** y **RLP (Relámpago)** se calculan **automáticamente**
  por el sistema — no se ingresan a mano:
  - **Rch**: se otorga cuando un jugador gana una partida justo después de haber ganado la
    anterior (una derrota rompe la racha). Vale 1 punto.
  - **RLP**: se activa desde la primera partida del mes, en cualquier partida ganada en menos
    de 60 minutos. Posición 1-10 → 1pt, 11-15 → 2pt, 16 en adelante → 3pt. Aplica a cualquiera.
  - **MG**: solo se activa desde "Fecha 06" en adelante. Se otorga a un ganador que **no** esté
    en el Top 5 si venció a algún rival que **sí** estaba en el Top 5 antes de esa partida.
    Posición 6-10 → 1pt, 11-15 → 2pt, 16 en adelante → 3pt. Los jugadores del Top 5 nunca reciben MG.
