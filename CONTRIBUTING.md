# Contributing · Cómo colaborar

*[Español más abajo](#español)*

Thanks for helping! The easiest and most welcome contribution is a **translation**.

## Translating the app

The interface texts live in [`src/locales/`](src/locales), one JSON file per
language (`en.json`, `es.json`…). The app lists every file it finds there, so a
new language only needs a new file — no code changes.

1. Copy `src/locales/en.json` to `src/locales/<code>.json`, where `<code>` is the
   [ISO 639-1](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes) code
   (`fr`, `de`, `pt`, `it`…; use a region only if needed, e.g. `pt-br`).
2. Edit `_meta`: `code` must equal the file name, `name` is the language name
   written in that language (`"Français"`), and add yourself to `authors`.
3. Translate the **values**, never the keys. Keep `{placeholders}` such as
   `{slot}` or `{message}` exactly as they are.
4. Run `npm run check-locales`. It fails on unknown keys or broken placeholders
   and lists what is still untranslated (missing keys fall back to English, so
   a partial translation is fine to send).
5. Open a pull request. To see it in the app: `npm start` → Settings → App language.

To fix a translation, just edit the file and open a pull request.

### Names from the game

Ingredient, dish and effect names are **not** in these files: they come from the
user's own copy of the game (`npm run extract`), in whatever languages that copy
has (the US version has English, Spanish and French). "Language of game names" in Settings picks among them.

## Other contributions

- Bugs and ideas: open an issue with your OS, game version/region and what you expected.
- Only the Wii U version (update v208, US) has been tested. If you can test the
  Switch version, please report what you find.
- Code: `npm test` must pass (translations, save reader and, if you have the game
  data extracted, the cooking simulator against 615 in-game results).
- **Never commit anything from the game** (`gamedata/`, icons, texts): it is
  Nintendo's and the repository only contains the tools that extract it locally.

---

## Español

¡Gracias por ayudar! La colaboración más fácil y bienvenida es una **traducción**.

### Traducir la app

Los textos de la interfaz están en [`src/locales/`](src/locales), un JSON por
idioma (`en.json`, `es.json`…). La app muestra todos los que encuentra ahí: para
un idioma nuevo basta con un archivo nuevo, sin tocar código.

1. Copia `src/locales/en.json` como `src/locales/<código>.json`, con el código
   [ISO 639-1](https://es.wikipedia.org/wiki/ISO_639-1) (`fr`, `de`, `pt`, `it`…;
   región solo si hace falta, p. ej. `pt-br`).
2. Edita `_meta`: `code` igual al nombre del archivo, `name` el nombre del idioma
   en ese idioma (`"Français"`), y añádete en `authors`.
3. Traduce los **valores**, nunca las claves. Deja los `{marcadores}` como
   `{slot}` o `{message}` tal cual.
4. Ejecuta `npm run check-locales`. Falla si hay claves que no existen o
   marcadores rotos, y te dice qué falta por traducir (lo que falte sale en
   inglés, así que puedes mandar una traducción parcial).
5. Abre un pull request. Para verla en la app: `npm start` → Ajustes → Idioma de la app.

Para corregir una traducción, edita el archivo y abre un pull request.

### Nombres del juego

Los nombres de ingredientes, platos y efectos **no** están en estos archivos:
salen de la copia del juego de cada usuario (`npm run extract`), en los idiomas
que tenga esa copia (la de EE. UU. trae inglés, español y francés). En Ajustes, "Idioma de los nombres
del juego" elige entre ellos.

### Otras colaboraciones

- Errores e ideas: abre un issue con tu sistema, versión/región del juego y qué esperabas.
- Solo está probada la versión de Wii U (actualización v208, EE. UU.). Si puedes
  probar la de Switch, cuéntanos qué encuentras.
- Código: `npm test` tiene que pasar (traducciones, lector de partidas y, si
  tienes los datos del juego extraídos, el simulador contra 615 resultados reales).
- **Nunca subas nada del juego** (`gamedata/`, iconos, textos): es de Nintendo y
  el repositorio solo tiene las herramientas que lo extraen en local.
