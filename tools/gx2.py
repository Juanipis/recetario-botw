"""Minimal Wii U (GX2) texture reader for the BotW inventory icons.

The icons in UI/StockItem/*.sbitemico are Yaz0-compressed BFRES files with a
single FTEX texture: 96x96, RGBA8 (sRGB), tile mode 4 (2D tiled thin1), no
MSAA and one mip. Only that path is implemented; anything else raises so a new
format is noticed instead of producing garbage.

The address math follows AMD's addrlib (computeSurfaceAddrFromCoordMacroTiled)
restricted to that case.
"""

import struct

_BPP = {0x1A: 32, 0x41A: 32}  # TCS_R8_G8_B8_A8_UNORM / _SRGB


def _pixel_index_32bpp(x, y):
    return ((x & 1) | ((x & 2) >> 1) << 1 | (y & 1) << 2 | ((x & 4) >> 2) << 3
            | ((y & 2) >> 1) << 4 | ((y & 4) >> 2) << 5)


def _macro_tiled_thin1_address(x, y, bpp, pitch, pipe_swizzle, bank_swizzle):
    elem_offset = (bpp * _pixel_index_32bpp(x, y) + 7) // 8
    pipe = ((y >> 3) ^ (x >> 3)) & 1
    bank = ((y >> 5) ^ (x >> 3)) & 1 | 2 * (((y >> 4) ^ (x >> 4)) & 1)
    bank_pipe = (pipe + 2 * bank) ^ (pipe_swizzle + 2 * bank_swizzle)
    bank_pipe %= 8
    pipe, bank = bank_pipe % 2, bank_pipe // 2
    macro_tile_pitch, macro_tile_height = 32, 16
    macro_tile_bytes = (bpp * macro_tile_height * macro_tile_pitch + 7) // 8
    macro_tile_offset = ((x // macro_tile_pitch) + (pitch // macro_tile_pitch) * (y // macro_tile_height)) * macro_tile_bytes
    total = elem_offset + (macro_tile_offset >> 3)
    return bank << 9 | pipe << 8 | total & 255 | (total & -256) << 3


def read_ftex(bfres):
    """Returns (width, height, rgba_bytes) of the first texture of a Wii U BFRES."""
    if bfres[:4] != b"FRES":
        raise ValueError("not a BFRES file")
    base = bfres.find(b"FTEX")
    if base < 0:
        raise ValueError("BFRES without textures")
    dim, width, height, depth, mips, fmt, aa, use, size = struct.unpack_from(">9I", bfres, base + 4)
    tile_mode, swizzle, _align, pitch = struct.unpack_from(">4I", bfres, base + 4 + 12 * 4)
    if fmt not in _BPP or tile_mode != 4 or aa != 0 or dim != 1:
        raise ValueError(f"unsupported texture: format={fmt:#x} tile={tile_mode} aa={aa} dim={dim}")
    data_field = base + 0xB0
    data_start = data_field + struct.unpack_from(">i", bfres, data_field)[0]
    data = bfres[data_start:data_start + size]
    if len(data) != size:
        raise ValueError("truncated texture data")
    bpp = _BPP[fmt]
    pipe_swizzle, bank_swizzle = (swizzle >> 8) & 1, (swizzle >> 9) & 3
    out = bytearray(width * height * 4)
    for y in range(height):
        for x in range(width):
            src = _macro_tiled_thin1_address(x, y, bpp, pitch, pipe_swizzle, bank_swizzle)
            dst = (y * width + x) * 4
            out[dst:dst + 4] = data[src:src + 4]
    return width, height, bytes(out)
