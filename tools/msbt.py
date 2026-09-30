"""Reader for Nintendo MSBT message files (the BotW text format).

Returns {label: Message}, where Message.text has the control tags removed and
Message.grammar holds the grammatical form declared by the game's group-201
tag (used to pick the right effect adjective, e.g. "vivaz" vs "vivaces").
"""

import struct
from dataclasses import dataclass

# second parameter byte of the group-201 tag -> CookEffect label suffix
GRAMMAR_FORMS = {0: "Masculine", 1: "Feminine", 2: "Neuter", 3: "Plural"}


@dataclass
class Message:
    text: str
    grammar: str | None = None


def _decode(raw, endian):
    chars, grammar, j = [], None, 0
    while j + 1 < len(raw):
        c = struct.unpack_from(endian + "H", raw, j)[0]
        if c == 0x0E:
            group, _type, plen = struct.unpack_from(endian + "HHH", raw, j + 2)
            params = raw[j + 8:j + 8 + plen]
            if group == 201 and len(params) >= 2:
                grammar = GRAMMAR_FORMS.get(params[1])
            j += 8 + plen
            continue
        if c == 0x0F:  # closing tag
            j += 6
            continue
        if c == 0:
            break
        chars.append(chr(c))
        j += 2
    return Message("".join(chars), grammar)


def parse_msbt(data):
    if data[:8] != b"MsgStdBn":
        raise ValueError("not an MSBT file")
    endian = ">" if data[8:10] == b"\xfe\xff" else "<"
    sections = struct.unpack_from(endian + "H", data, 0x0E)[0]
    off, labels, texts = 0x20, {}, []
    for _ in range(sections):
        magic = data[off:off + 4]
        size = struct.unpack_from(endian + "I", data, off + 4)[0]
        body = off + 16
        if magic == b"LBL1":
            buckets = struct.unpack_from(endian + "I", data, body)[0]
            for i in range(buckets):
                count, rel = struct.unpack_from(endian + "II", data, body + 4 + i * 8)
                p = body + rel
                for _ in range(count):
                    ln = data[p]
                    name = data[p + 1:p + 1 + ln].decode()
                    labels[name] = struct.unpack_from(endian + "I", data, p + 1 + ln)[0]
                    p += 1 + ln + 4
        elif magic == b"TXT2":
            count = struct.unpack_from(endian + "I", data, body)[0]
            offsets = [struct.unpack_from(endian + "I", data, body + 4 + i * 4)[0] for i in range(count)] + [size]
            texts = [_decode(data[body + offsets[i]:body + offsets[i + 1]], endian) for i in range(count)]
        off = (body + size + 15) & ~15
    return {label: texts[i] for label, i in labels.items() if i < len(texts)}
