#!/usr/bin/env python3
"""Extracts everything Recetario BotW needs from the user's own copy of the game.

Output (not committed to git, it is Nintendo's data):
    gamedata/data.json      ingredients, dishes, recipes, cooking constants, texts
    gamedata/icons/*.png    original inventory icons

Point it to the "content" folders of your own copy of the game: base game,
update and (optionally) DLC. Files are taken in the order update > base > DLC.
"""

import argparse
import datetime
import json
import sys
import zlib
from pathlib import Path

import oead
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gx2 import read_ftex  # noqa: E402
from msbt import parse_msbt  # noqa: E402

COOK_TAGS = ["CookOre", "CookInsect", "CookEnemy", "CookMeat", "CookFish",
             "CookFruit", "CookMushroom", "CookPlant", "CookSpice"]
FLAG_TAGS = ["CookMaterial", "CookLowPrice", "RoastItem"]
EFFECTS = ["None", "LifeRecover", "LifeMaxUp", "ResistHot", "ResistCold", "ResistElectric",
           "MovingSpeed", "AttackUp", "DefenseUp", "Quietness", "ExGutsMaxUp", "GutsRecover", "Fireproof"]
# the texts and elixir icons call MovingSpeed "AllSpeed"
EFFECT_TEXT_KEY = {"MovingSpeed": "AllSpeed"}
# names CookData uses for its effect table (CEI); the one left unresolved is ExGutsMaxUp
CEI_ALIASES = {"AllSpeed": "MovingSpeed", "StaminaRecover": "GutsRecover"}
# Bootup_<region><lang>.pack; when a language exists in several regions the first wins
REGION_PRIORITY = ["US", "EU", "JP", "CN", "KR", "TW"]


def crc(s):
    return zlib.crc32(s.encode()) & 0xFFFFFFFF


def to_py(node):
    if isinstance(node, oead.byml.Hash):
        return {k: to_py(v) for k, v in node.items()}
    if isinstance(node, oead.byml.Array):
        return [to_py(v) for v in node]
    return node.v if hasattr(node, "v") else node


def find_ci(parent, *parts):
    """Path join that matches each part case-insensitively (folder names vary in case)."""
    cur = Path(parent)
    for part in parts:
        if not cur.is_dir():
            return None
        match = next((c for c in cur.iterdir() if c.name.lower() == part.lower()), None)
        if match is None:
            return None
        cur = match
    return cur


class Game:
    def __init__(self, base, update, dlc):
        self.roots = [p for p in (update, base, dlc) if p]
        if not self.roots:
            raise SystemExit("No game folder given (use --base, --update and --dlc)")
        self._titlebg = []
        for r in (update, base):
            p = r and find_ci(r, "Pack", "TitleBG.pack")
            if p:
                self._titlebg.append(oead.Sarc(p.read_bytes()))

    def file(self, *parts):
        for r in self.roots:
            p = find_ci(r, *parts)
            if p and p.is_file():
                return p
        return None

    def actor_pack(self, name):
        p = self.file("Actor", "Pack", f"{name}.sbactorpack")
        if p:
            return p.read_bytes()
        for sarc in self._titlebg:
            f = sarc.get_file(f"Actor/Pack/{name}.sbactorpack")
            if f:
                return bytes(f.data)
        return None


def general_params(game, name):
    """CureItem / CookSpice / Item objects of the actor's GeneralParamList."""
    data = game.actor_pack(name)
    if not data:
        return {}
    sarc = oead.Sarc(oead.yaz0.decompress(data))
    gpl = next((f for f in sarc.get_files() if f.name.endswith(".bgparamlist")), None)
    if not gpl:
        return {}
    pio = oead.aamp.ParameterIO.from_binary(bytes(gpl.data))
    out = {}
    for obj_name in ("CureItem", "CookSpice", "Item"):
        try:
            obj = pio.objects[obj_name]
        except KeyError:
            continue
        for key in ("HitPointRecover", "EffectType", "EffectLevel", "EffectiveTime",
                    "BoostHitPointRecover", "BoostEffectiveTime", "BoostSuccessRate",
                    "BoostMaxHeartLevel", "BoostStaminaLevel", "SellingPrice", "BuyingPrice"):
            try:
                v = obj.params[key].v
            except KeyError:
                continue
            out[f"{obj_name}.{key}"] = v if isinstance(v, (bool, int, float)) else str(v)
    return out


def available_languages(game):
    """{'es': 'USes', 'en': 'USen', ...} from the Bootup_XXyy.pack files present."""
    codes = set()
    for r in game.roots:
        pack_dir = find_ci(r, "Pack")
        if pack_dir:
            codes |= {p.stem[len("Bootup_"):] for p in pack_dir.glob("Bootup_*.pack") if len(p.stem) == len("Bootup_") + 4}
    langs = {}
    for code in sorted(codes, key=lambda c: REGION_PRIORITY.index(c[:2]) if c[:2] in REGION_PRIORITY else 99):
        langs.setdefault(code[2:].lower(), code)
    return langs


def load_messages(game, code):
    """{(msbt file, label): Message} of one Bootup_<code>.pack, update over base."""
    packs = [p for p in (find_ci(r, "Pack", f"Bootup_{code}.pack") for r in game.roots) if p]
    msgs = {}
    for pack in reversed(packs):  # lowest priority first, update overwrites
        boot = oead.Sarc(pack.read_bytes())
        for f in boot.get_files():
            if "Msg_" not in f.name:
                continue
            inner = oead.Sarc(oead.yaz0.decompress(f.data))
            for m in inner.get_files():
                if m.name.endswith(".msbt"):
                    group = Path(m.name).stem
                    for label, msg in parse_msbt(bytes(m.data)).items():
                        msgs[(group, label)] = msg
    return msgs


def export_icon(game, actor, out_dir):
    p = game.file("UI", "StockItem", f"{actor}.sbitemico")
    if not p:
        return None
    w, h, rgba = read_ftex(bytes(oead.yaz0.decompress(p.read_bytes())))
    Image.frombytes("RGBA", (w, h), rgba).save(out_dir / f"{actor}.png", optimize=True)
    return f"{actor}.png"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True, help='"content" folder of the base game')
    ap.add_argument("--update", help='"content" folder of the update (recommended)')
    ap.add_argument("--dlc", help='"content" folder of the DLC, if you have it')
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "gamedata"))
    args = ap.parse_args()

    base, update, dlc = (Path(p) if p else None for p in (args.base, args.update, args.dlc))
    print(f"base game: {base}\nupdate   : {update}\nDLC      : {dlc}")
    game = Game(base, update, dlc)

    out = Path(args.out)
    (out / "icons").mkdir(parents=True, exist_ok=True)

    names = {}
    actor_info = to_py(oead.byml.from_binary(oead.yaz0.decompress(game.file("Actor", "ActorInfo.product.sbyml").read_bytes())))
    actors = {a["name"]: a for a in actor_info["Actors"]}
    for n in actors:
        names[crc(n)] = n
    tag_names = {crc(t): t for t in COOK_TAGS + FLAG_TAGS}
    effect_names = {crc(e): e for e in EFFECTS}
    effect_names.update({crc(alias): e for alias, e in CEI_ALIASES.items()})

    def actor_tags(a):
        return {tag_names[v] for v in (a.get("tags") or {}).values() if v in tag_names}

    boot = oead.Sarc(game.file("Pack", "Bootup.pack").read_bytes())
    cook = to_py(oead.byml.from_binary(oead.yaz0.decompress(boot.get_file("Cooking/CookData.sbyml").data)))

    # ---- ingredients
    ingredients = {}
    for name, a in sorted(actors.items()):
        t = actor_tags(a)
        # ancient parts are cookable (CookEnemy) but lack CookMaterial
        cookable = t & {"CookMaterial", "RoastItem"} or (a.get("profile") == "Item" and t & set(COOK_TAGS))
        if not cookable:
            continue
        gp = general_params(game, name)
        eff = gp.get("CureItem.EffectType", a.get("cureItemEffectType", "None")) or "None"
        ingredients[name] = {
            "hp": gp.get("CureItem.HitPointRecover", a.get("cureItemHitPointRecover", 0)),
            "effect": eff,
            "potency": gp.get("CureItem.EffectLevel", a.get("cureItemEffectLevel", 0)),
            "time": gp.get("CureItem.EffectiveTime", a.get("cureItemEffectiveTime", 900)),
            "tag": next((x for x in COOK_TAGS if x in t), ""),
            "timeBoost": gp.get("CookSpice.BoostEffectiveTime", a.get("cookSpiceBoostEffectiveTime", 0)),
            "hpBoost": gp.get("CookSpice.BoostHitPointRecover", a.get("cookSpiceBoostHitPointRecover", 0)),
            "critRate": gp.get("CookSpice.BoostSuccessRate", a.get("cookSpiceBoostSuccessRate", 0)),
            "sell": gp.get("Item.SellingPrice", a.get("itemSellingPrice", 0)),
            "buy": gp.get("Item.BuyingPrice", a.get("itemBuyingPrice", 0)),
            "lowPrice": "CookLowPrice" in t,
            "roast": "RoastItem" in t,
            "sortKey": a.get("sortKey", 0),
            "iconActor": a.get("itemUseIconActorName") or name,
        }

    # ---- recipes, in the order the game evaluates them
    def resolve_list(v):
        return [names.get(x, f"#{x:08x}") for x in v]

    def resolve_tags(v):
        return [tag_names.get(x, f"#{x:08x}") for x in v]

    recipes = []
    for r in cook["Recipes"]:
        recipes.append({"result": names[r["Recipe"]], "hb": r.get("HB", 0), "single": False, "num": 0,
                        "actors": [resolve_list(g) for g in r.get("Actors", [])],
                        "tags": [resolve_tags(g) for g in r.get("Tags", [])]})
    for r in cook["SingleRecipes"]:
        recipes.append({"result": names[r["Recipe"]], "hb": r.get("HB", 0), "single": True, "num": r.get("Num", 1),
                        "actors": resolve_list(r.get("Actors", [])), "tags": resolve_tags(r.get("Tags", []))})

    sysd = cook["System"]
    system = {k: (names.get(v, v) if k in ("FA", "FCA", "MEA") else v) for k, v in sysd.items() if k != "CEI"}
    system["effects"] = {effect_names.get(c["T"], "ExGutsMaxUp"): {k: v for k, v in c.items() if k != "T"} for c in sysd["CEI"]}
    assert len(system["effects"]) == len(sysd["CEI"]), "more than one unresolved CookData effect"

    dishes = sorted({r["result"] for r in recipes} | {system["FA"], system["FCA"], "Item_Cook_O_02", "Item_Cook_C_17"})

    # ---- texts
    strings = {}
    for lang, code in available_languages(game).items():
        msgs = load_messages(game, code)
        by_label = {}
        for (group, label), msg in msgs.items():
            by_label.setdefault(label, msg)
        tx = {"_code": code, "items": {}, "dishes": {}, "effects": {}}
        for n in ingredients:
            nm, desc = by_label.get(f"{n}_Name"), by_label.get(f"{n}_Desc")
            if nm:
                tx["items"][n] = {"name": nm.text, "desc": desc.text if desc else ""}
        for n in dishes:
            nm = msgs.get(("CookResult", f"{n}_Name")) or by_label.get(f"{n}_Name")
            if nm:
                desc = msgs.get(("CookResult", f"{n}_Desc"))
                tx["dishes"][n] = {"name": nm.text, "grammar": nm.grammar, "desc": desc.text if desc else ""}
        for e in EFFECTS[1:]:
            k = EFFECT_TEXT_KEY.get(e, e)
            entry = {}
            for field in ("Name", "Name_Masculine", "Name_Feminine", "Name_Neuter", "Name_Plural",
                          "Desc", "Desc_02", "Desc_03", "MedicineDesc", "MedicineDesc_02", "MedicineDesc_03"):
                m = msgs.get(("CookEffect", f"{k}_{field}"))
                if m:
                    entry[field] = m.text
            status = msgs.get(("SpecialStatus", f"{k}_Name"))
            if status:
                entry["status"] = status.text
            tx["effects"][e] = entry
        strings[lang] = tx
        print(f"texts {lang} ({code}): {len(tx['items'])} ingredients, {len(tx['dishes'])} dishes")

    # ---- icons
    icons = {}
    wanted = {n: v["iconActor"] for n, v in ingredients.items()}
    wanted.update({n: n for n in dishes})
    for e in EFFECTS[2:]:
        variant = f"Item_Cook_C_17_{EFFECT_TEXT_KEY.get(e, e)}"
        wanted[variant] = variant
    for i, (key, icon_actor) in enumerate(sorted(wanted.items())):
        if icon_actor not in icons.values():
            f = export_icon(game, icon_actor, out / "icons")
        else:
            f = f"{icon_actor}.png"
        if f:
            icons[key] = f
        if i % 50 == 0:
            print(f"icons {i}/{len(wanted)}")

    data = {
        "format": 1,
        "generated": datetime.datetime.now().isoformat(timespec="seconds"),
        "source": {"base": str(base), "update": str(update), "dlc": str(dlc)},
        "system": system,
        "ingredients": ingredients,
        "dishes": dishes,
        "recipes": recipes,
        "icons": icons,
        "strings": strings,
    }
    (out / "data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
    print(f"done: {len(ingredients)} ingredients, {len(dishes)} dishes, {len(recipes)} recipes, {len(icons)} icons -> {out}")


if __name__ == "__main__":
    main()
