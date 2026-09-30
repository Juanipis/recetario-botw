# Recetario BotW

*English · [Español](README.es.md)*

Unofficial desktop app (macOS, Windows and Linux) that reads your *The Legend of
Zelda: Breath of the Wild* save file and tells you what you can cook with what you
carry.

- **Your ingredients** at the top, with their quantities from your save, grouped
  like the in-game inventory.
- **The cooking pot**: click ingredients and see right away what comes out —
  hearts, effect, level, duration, selling price and what a critical cook gives.
- **What each dish does, at a glance**: every card shows how many hearts it heals,
  its best price and each effect it can give (with its own icon and color, best
  level and duration). Open it to see **what to put in, and how many**, to get each
  effect, and filter the list by effect.
- **Recipes**: every recipe in the game. The ones you can make look normal; the
  ones you could make with **one more ingredient** are dimmed and tell you what
  is missing. Elixirs get one card per effect.
- **Variations**: open a recipe to see every combination your inventory allows,
  sorted by price, hearts, potency/duration or number of ingredients, plus the
  ones you could make with one more ingredient.
- **Reloads by itself** when the save file changes (or with ⌘R / Ctrl+R).
- Settings: save location, slot, app language and language of item names, theme,
  icon size…
- **Multilingual**: the interface is in English and Spanish, and a new language
  is just one file (see [Translations](#translations)).

> **No game content is included in this repository.** Item names, descriptions,
> recipes and icons are read on your computer from your own copy of the game, with
> the extractor described below. Nothing from the game is ever committed or
> distributed.

## Getting started

You need Node 20+, Python 3.12 (for [`oead`](https://github.com/zeldamods/oead))
and your own copy of the game (base game, update and, optionally, DLC).

```sh
npm install
python3.12 -m venv .venv && .venv/bin/pip install -r tools/requirements.txt
npm run extract -- --base <content> --update <content> --dlc <content>
npm start            # run the app in development mode
npm test             # translations, save reader and the cooking simulator
```

`--base`, `--update` and `--dlc` are the `content` folders of the base game, the
update and the DLC. To avoid typing them every time, put them in
`extract.local.json` (ignored by git) and run just `npm run extract`:

```json
{ "base": "…/content", "update": "…/content", "dlc": "…/content" }
```

The extracted data goes to `gamedata/`, which is ignored by git.

### Building the app

```sh
npm run install:mac  # builds it for this Mac and installs it in /Applications
npm run dist:mac     # dist/*-mac.zip (arm64 and x64)
npm run dist:win     # dist/Recetario BotW-<v>-portable.exe and zip
npm run dist:linux   # dist/*.AppImage and tar.gz
```

The build bundles your `gamedata/`, so it is **for your own use only**: do not
share or upload the built app. The macOS build is ad-hoc signed (not notarized).

## Save file

In Settings, choose the folder that contains your `game_data.sav` (or the folder
with the numbered slots `0`, `1`, `2`…), or the file itself. "Most recent" picks the
slot saved last. The save is only read, never modified.

### What has been tested

- **Tested:** save files and game data of the **Wii U version**, update 1.5.0
  (v208), US region (texts in English, Spanish and French).
- **Not tested:** the Switch version. The save reader accepts its format
  (little-endian) and the app marks it as untested, but nobody has checked it with
  a real Switch save or with Switch game data yet. Reports and fixes are welcome.

## Translations

The interface uses `src/locales/<code>.json` (today `en` and `es`). On first run it
follows the system language; you can change it in Settings. Adding or fixing a
language is a pull request with that one file: see
[CONTRIBUTING.md](CONTRIBUTING.md) and check it with `npm run check-locales`.
Ingredient and dish names come from your copy of the game, in the languages it has.

## How it works

- `tools/extract_gamedata.py` reads the cooking tables, each ingredient's
  parameters (hearts, effect, potency, prices, boosts), the message files (names,
  descriptions and grammatical gender) and the inventory icons, which it converts
  to PNG (`tools/gx2.py`).
- `src/shared/cooking.js` is the cooking simulator, ported from
  [savage13/cooking](https://github.com/savage13/cooking) and checked against its
  collection of 615 real cooking results (`tests/fixtures`). One detail those
  results confirm: every ingredient adds 30 s of duration whatever its own effect
  time says; only Monster Extract adds nothing.
- `src/shared/planner.js` decides which cards you can make and generates the
  variations, checking every combination with the simulator (the game picks the
  first recipe that matches, in its own order).
- `src/main/savefile.js` reads `game_data.sav`: `(crc32(name), value)` pairs; the
  inventory is `PorchItem` (names) + `PorchItem_Value1` (quantities).
- Electron: `src/main` (main process, settings, file watching), `src/renderer`
  (interface) and `src/locales`, served through a custom `app://` protocol.

## License and disclaimer

The code is MIT. The simulator and the test data come from savage13 (BSD-2), see
[LICENSE-THIRD-PARTY.md](LICENSE-THIRD-PARTY.md).

This is an unofficial fan project, not affiliated with, endorsed or sponsored by
Nintendo. *The Legend of Zelda* and *Breath of the Wild* are trademarks of
Nintendo; the game and its content are © Nintendo.
