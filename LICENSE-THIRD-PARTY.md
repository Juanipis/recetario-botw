# Third-party notices

## savage13/cooking — BSD 2-Clause

`src/shared/cooking.js` is a port of the cooking simulator from
<https://github.com/savage13/cooking>, and `tests/fixtures/*.json` are its
collection of in-game results.

```
BSD 2-Clause License

Copyright (c) 2022, savage13@gmail.com

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## AMD addrlib

`tools/gx2.py` reimplements, for one texture layout only, the macro-tiled
address calculation of AMD's addrlib (as documented in open-source projects such
as aboood40091/GTX-Extractor). No code was copied.

## Game data

Nothing from *The Legend of Zelda: Breath of the Wild* is included in this
repository. `gamedata/` (texts, recipes, icons) is generated locally from the
user's own copy of the game by `tools/extract_gamedata.py` and is never committed.
This is an unofficial fan project, not affiliated with or endorsed by Nintendo.
*The Legend of Zelda* and *Breath of the Wild* are trademarks of Nintendo; the
game and its content are © Nintendo.
