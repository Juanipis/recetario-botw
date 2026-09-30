# Recetario BotW

*[English](README.md) · Español*

App de escritorio no oficial (macOS, Windows y Linux) que lee tu partida de *The
Legend of Zelda: Breath of the Wild* y te dice qué puedes cocinar con lo que llevas.

- **Tus ingredientes** arriba, con las cantidades de tu partida, agrupados como
  en el inventario del juego.
- **La olla**: tocas ingredientes y ves al momento qué sale, con corazones,
  efecto, nivel, duración, precio de venta y lo que daría un crítico.
- **Recetas**: todas las del juego. Las que puedes hacer salen normales; las que
  harías con **un ingrediente más** salen apagadas, diciendo qué te falta. Los
  elixires tienen una tarjeta por efecto.
- **Variaciones**: al abrir una receta ves todas las combinaciones que puedes
  hacer con tu inventario, ordenables por precio, corazones, potencia/duración o
  número de ingredientes, y las que harías si consiguieras un ingrediente más.
- **Se recarga sola** cuando cambia la partida (o con ⌘R / Ctrl+R).
- Ajustes: dónde está la partida, ranura, idioma de la app y de los nombres de
  los objetos, tema, tamaño de iconos…
- **Multiidioma**: la interfaz está en español e inglés y se pueden añadir más
  idiomas con un solo archivo (ver [Traducciones](#traducciones)).

> **Este repositorio no incluye nada del juego.** Los nombres, descripciones,
> recetas e iconos se leen en tu ordenador desde tu propia copia del juego, con el
> extractor que se explica abajo. Nada del juego se sube ni se distribuye.

## Cómo se usa

Necesitas Node 20+, Python 3.12 (por [`oead`](https://github.com/zeldamods/oead))
y tu propia copia del juego (juego base, actualización y, si lo tienes, DLC).

```sh
npm install
python3.12 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt
npm run extract -- --base <content> --update <content> --dlc <content>
npm start            # abre la app en modo desarrollo
npm test             # traducciones, lector de partidas y simulador de cocina
```

`--base`, `--update` y `--dlc` son las carpetas `content` del juego base, la
actualización y el DLC. Para no escribirlas cada vez, ponlas en
`extract.local.json` (git lo ignora) y ejecuta solo `npm run extract`:

```json
{ "base": "…/content", "update": "…/content", "dlc": "…/content" }
```

Los datos extraídos van a `gamedata/`, que git también ignora.

### Generar la app

```sh
npm run dist:mac     # dist/mac-arm64/Recetario BotW.app (+ zips arm64/x64)
npm run dist:win     # dist/Recetario BotW-<v>-portable.exe y zip
npm run dist:linux   # dist/*.AppImage y tar.gz
```

La app generada lleva dentro tu `gamedata/`, así que es **solo para tu uso**: no
la compartas ni la subas. La de macOS va firmada ad-hoc (sin notarizar).

## La partida

En Ajustes, elige la carpeta que contiene tu `game_data.sav` (o la carpeta con
las ranuras numeradas `0`, `1`, `2`…), o el archivo directamente. "La más
reciente" usa la última ranura guardada. La partida solo se lee, nunca se modifica.

### Qué está probado

- **Probado:** partidas y datos del juego de la **versión de Wii U**,
  actualización 1.5.0 (v208), región EE. UU. (textos en inglés, español y francés).
- **Sin probar:** la versión de Switch. El lector acepta su formato
  (little-endian) y la app la marca como sin probar, pero nadie la ha comprobado
  todavía con una partida o datos reales de Switch. Se agradecen reportes y arreglos.

## Traducciones

La interfaz usa `src/locales/<código>.json` (hoy `es` y `en`). La primera vez
elige el idioma del sistema y luego se cambia en Ajustes. Para añadir o corregir
un idioma basta un pull request con ese archivo: lee
[CONTRIBUTING.md](CONTRIBUTING.md) y comprueba con `npm run check-locales`. Los
nombres de ingredientes y platos salen de tu copia del juego, en los idiomas que
tenga.

## Cómo funciona

- `tools/extract_gamedata.py` lee las tablas de cocina, los parámetros de cada
  ingrediente (corazones, efecto, potencia, precios, bonificaciones), los archivos
  de mensajes (nombres, descripciones y género gramatical) y los iconos del
  inventario, que convierte a PNG (`tools/gx2.py`).
- `src/shared/cooking.js` es el simulador de cocina, portado de
  [savage13/cooking](https://github.com/savage13/cooking) y comprobado contra su
  colección de 615 resultados reales (`tests/fixtures`). Un detalle que confirman
  esos resultados: cada ingrediente suma 30 s de duración diga lo que diga su
  propio tiempo de efecto; solo la esencia de monstruo no suma.
- `src/shared/planner.js` decide qué tarjetas puedes hacer y genera las
  variaciones, comprobando cada combinación con el simulador (el juego elige la
  primera receta que encaja, en su propio orden).
- `src/main/savefile.js` lee `game_data.sav`: pares `(crc32(nombre), valor)`; el
  inventario es `PorchItem` (nombres) + `PorchItem_Value1` (cantidades).
- Electron: `src/main` (proceso principal, ajustes, vigilancia del archivo),
  `src/renderer` (interfaz) y `src/locales`, servidos por un protocolo `app://` propio.

## Licencia y aviso

El código es MIT. El simulador y los datos de prueba vienen de savage13 (BSD-2),
ver [LICENSE-THIRD-PARTY.md](LICENSE-THIRD-PARTY.md).

Es un proyecto de fans no oficial, sin relación con Nintendo ni respaldo suyo.
*The Legend of Zelda* y *Breath of the Wild* son marcas de Nintendo; el juego y
su contenido son © Nintendo.
