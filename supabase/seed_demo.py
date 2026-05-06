#!/usr/bin/env python3
"""
Demo seed v2: hand-crafted ASCII pixel-art sprites stamped into 7 neighborhoods.

Each sprite is a small ASCII pattern; we scale-up and stamp at random
non-overlapping positions in a ~220x220 area around each neighborhood center.
Outputs one SQL file per neighborhood: supabase/demo_seed_<name>.sql

Run:  python3 supabase/seed_demo.py
Wipe: DELETE FROM pixel_events WHERE session_id LIKE 'demo-%';
"""
import math
import random
from pathlib import Path

# ---- projection (matches src/lib/coordinates.ts) ----
NYC_SW = (40.4774, -74.2591)
NYC_NE = (40.9176, -73.7004)
LAT_SPAN = NYC_NE[0] - NYC_SW[0]
LNG_SPAN = NYC_NE[1] - NYC_SW[1]
WORLD_WIDTH = round((LNG_SPAN * 273_000) / 10)
WORLD_HEIGHT = round((LAT_SPAN * 364_000) / 10)


# ---- palette (matches src/config/tuning.ts) ----
BLACK    = '#1a1a1a'
OFFWHITE = '#f0ebe0'
RED      = '#e63946'
ORANGE   = '#ed8a3a'
YELLOW   = '#f0c52a'
GREEN    = '#57a66d'
BLUE     = '#3d8eb9'
PINK     = '#ed6b96'
PURPLE   = '#7a5db0'
BROWN    = '#8b5d40'

PALETTE_CHARS = {
    'K': BLACK, 'W': OFFWHITE, 'R': RED, 'O': ORANGE, 'Y': YELLOW,
    'G': GREEN, 'B': BLUE, 'P': PINK, 'U': PURPLE, 'N': BROWN,
}

NEIGHBORHOODS = {
    'astoria':       (40.7721, -73.9302),
    'greenpoint':    (40.7290, -73.9523),
    'williamsburg':  (40.7081, -73.9571),
    'bushwick':      (40.6944, -73.9213),
    'eastvillage':   (40.7265, -73.9815),
    'midtown':       (40.7549, -73.9840),
    'upperwestside': (40.7870, -73.9754),
}


def lat_lng_to_world(lat, lng):
    x = round(((lng - NYC_SW[1]) / LNG_SPAN) * WORLD_WIDTH)
    y = round(((lat - NYC_SW[0]) / LAT_SPAN) * WORLD_HEIGHT)
    return x, y


# ---- sprite library ----
# Multi-line ASCII art. Common indent is stripped. '.' = empty.
SPRITES = {
    'heart': """
        .RR.RR.
        RRRRRRR
        RRRRRRR
        .RRRRR.
        ..RRR..
        ...R...
    """,
    'taxi': """
        ...YYYYYY...
        ..YYYYYYYY..
        .YYYWWYYYY..
        YYYYYYYYYYYY
        YYYBBYYYYYY.
        KKKKKKKKKKKK
        .KK..KK..KK.
    """,
    'empire': """
        .....KK....
        ....KKKK...
        ...KKKKKK..
        ...KYKKYKK.
        ..KKKKKKKKK
        ..KYKKYKYKK
        ..KYKKYKYKK
        .KKKKKKKKKK
        .KYYKKYKKYK
        .KYYKKYKKYK
        KKKKKKKKKKK
    """,
    'liberty': """
        ....G....
        ...GGG...
        ..G.G.G..
        ..GGGGG..
        ...GGG...
        ....G....
        ...GGG...
        ..GGGGG..
        .GGGGGGG.
        GGGGGGGGG
    """,
    'pizza': """
        ....NNN....
        ...NRRRRN..
        ..NRRYRRRN.
        .NRRRRRRRRN
        NRRYRRRRRRR
        NRRRRRYRRRR
        .NRRRRRRRRR
        ..NRRRRRRR.
        ...NRRRRR..
        ....NRRR...
        .....NN....
    """,
    'hot_dog': """
        .NNNNNNNNNN.
        NWRRRRRRRRWN
        NWRRRRRRRRWN
        NWRRRRRRRRWN
        NWRRRRRRRRWN
        .NNNNNNNNNN.
    """,
    'bagel': """
        ..NNNNNN..
        .NNNNNNNN.
        NN..NN..NN
        NN.NNNN.NN
        NN.NNNN.NN
        NN..NN..NN
        .NNNNNNNN.
        ..NNNNNN..
    """,
    'pigeon': """
        ..K.....
        .KKK....
        KKKKK..K
        KKWKKKKK
        KKKKKKKK
        .KKKKKK.
        ..K..K..
    """,
    'pikachu': """
        ..K.....K..
        .YK....KY..
        YYYK..KYYY.
        YYKYYYYKYY.
        YYYYYYYYYY.
        YYYRYYRYYY.
        YYYYYYYYYY.
        .YYYYYYYY..
        ..KKYYKK...
        .KKKKYKKKK.
        .K..KK..K..
    """,
    'mario': """
        ..RRRR...
        .RRRRRR..
        .NNYYNN..
        NYNYYYNY.
        NYYYYYNY.
        .NYYYYY..
        ..RYRR...
        RRRRRRRR.
        RNNRRNNR.
        .NN..NN..
        .NN..NN..
    """,
    'mickey': """
        .KK....KK.
        KKKK..KKKK
        KKKK..KKKK
        .KKKKKKKK.
        ..KKKKKK..
        ...KKKK...
    """,
    'spongebob': """
        .YYYYYYY.
        YKYYYYYKY
        YYYYYYYYY
        YRRRRRRRY
        YRYRYRYRY
        YRRRRRRRY
        .YYYYYYY.
        .NNNNNNN.
        KKKKKKKKK
        N.N...N.N
    """,
    'snoopy': """
        ..WWWWW.
        .WKKKWWW
        WWKKKWKW
        .WWWWWWW
        ..WWWWW.
        ...WWW..
        ....W...
    """,
    'bk_letters': """
        .UUUU....KKKK..
        UUUUUU..KKKKKK.
        UU..UU..KK..KK.
        UUUUU...KKKKK..
        UU..UU..KK..KK.
        UUUUUU..KKKKKK.
        .UUUU....KKKK..
    """,
    'crown': """
        Y...YY...Y
        YY.YYYY.YY
        YYYYYYYYYY
        YYRRYYRRYY
        YYYYYYYYYY
        KKKKKKKKKK
    """,
    'boombox': """
        KKKKKKKKKKKKKK
        KWWWWWWWWWWWWK
        KW.KKKK.KKKKWK
        KW..KK...KKKWK
        KW..KK...KKKWK
        KW.KKK.KKKKKWK
        KKKKKKKKKKKKKK
    """,
    'spray_can': """
        .KK..
        WKKKW
        WKKKW
        KKKKK
        KRRRK
        KRRRK
        KRRRK
        KRRRK
        KRRRK
        KKKKK
    """,
    'star': """
        ...YY...
        ...YY...
        .YYYYYY.
        YYYYYYYY
        .YYYYYY.
        YYY..YYY
        YY....YY
        Y......Y
    """,
    'coffee': """
        .K.K.K..
        .K.K.K..
        NNNNNNNN
        WNNNNNNW
        WNNNNNNW
        WNNNNNNW
        WNNNNNNW
        WWNNNNWW
        .KKKKK..
    """,
    'vinyl': """
        ..KKKKKK..
        .KKKKKKKK.
        KKKKKKKKKK
        KKKWWWWKKK
        KKWRRRRWKK
        KKKWWWWKKK
        KKKKKKKKKK
        .KKKKKKKK.
        ..KKKKKK..
    """,
    'sunglasses': """
        KKKK..KKKK
        KBBKKKKBBK
        KBBKKKKBBK
        KKKKKKKKKK
        ...KKKK...
    """,
    'mustache': """
        KKK....KKK
        KKKKKKKKKK
        .KKKKKKKK.
        ..KK..KK..
    """,
    'lightning': """
        .YYYY.
        YYYY..
        YYY...
        YYYY..
        .YYYY.
        ..YYYY
        ...YYY
        ..YYY.
        .YYYY.
        YYYY..
    """,
    'skull': """
        .WWWWWW.
        WWWWWWWW
        WKWKKKWK
        WKWKKKWK
        WWWWWWWW
        .WKWKW..
        WKWKWKW.
        .W.W.W..
    """,
    'beer_mug': """
        .YYYYYY.
        YYYYYYYY
        YYYYYYYW
        WWWWWWWW
        WWWWWWWW
        WWWWWWWW
        WWWWWWWW
        .WWWWWW.
    """,
    'cassette': """
        KKKKKKKKKK
        KKKKKKKKKK
        KW.KKKK.WK
        KK..KK..KK
        KW.KKKK.WK
        KKKKKKKKKK
        KKKKKKKKKK
    """,
    'music_note': """
        ....KK
        .KKKKK
        KKKKKK
        KKKKKK
        K....K
        K.....
        K.....
        KK....
        KKK...
    """,
    'tree': """
        ..GGGG..
        .GGGGGG.
        GGGGGGGG
        GGGGGGGG
        .GGGGGG.
        ..GGGG..
        ....N...
        ....N...
    """,
    'brownstone': """
        NNNNNNNN
        NWWNNWWN
        NWWNNWWN
        NNNNNNNN
        NWWNNWWN
        NWWNNWWN
        NNNNNNNN
        NWWNNWWN
        NWWNNWWN
        NNNNNNNN
    """,
    'greek_temple': """
        ...KKKKKK...
        ..KKKKKKKK..
        WWWWWWWWWWWW
        W.W.W.W.W.W.
        W.W.W.W.W.W.
        W.W.W.W.W.W.
        W.W.W.W.W.W.
        WWWWWWWWWWWW
        NNNNNNNNNNNN
    """,
    'greek_flag': """
        BBBBBBBBBB
        WW.W.WBBBB
        BWWWWWBBBB
        WW.W.WBBBB
        WWWWWWWWWW
        BBBBBBBBBB
        WWWWWWWWWW
        BBBBBBBBBB
    """,
    'pierogi': """
        .NNNNNN.
        NWWWWWWN
        NWNWNWNN
        NWWWWWWN
        .NNNNNN.
    """,
    'sailboat': """
        ......W..
        .....WW..
        ....WWW..
        ...WWWW..
        ..WWWWW..
        .WWWWWW..
        WWWWWWW..
        KKKKKKKKK
        .KKKKKKK.
        ..KKKKK..
    """,
    'polish_flag': """
        WWWWWWWW
        WWWWWWWW
        RRRRRRRR
        RRRRRRRR
        RRRRRRRR
    """,
}


def normalize_art(name):
    raw = SPRITES[name].strip('\n').splitlines()
    # strip the common leading indent
    indents = [len(L) - len(L.lstrip()) for L in raw if L.strip()]
    indent = min(indents) if indents else 0
    return [L[indent:] for L in raw]


def sprite_dims(name, scale):
    art = normalize_art(name)
    h = len(art) * scale
    w = max(len(L) for L in art) * scale
    return w, h


def stamp(out, ox, oy, name, scale):
    art = normalize_art(name)
    for dy, line in enumerate(art):
        for dx, ch in enumerate(line):
            color = PALETTE_CHARS.get(ch)
            if color is None:
                continue
            for sy in range(scale):
                for sx in range(scale):
                    out[(ox + dx * scale + sx, oy + dy * scale + sy)] = color


# ---- per-neighborhood plans: thematic + variety mix ----
PLANS = {
    'astoria':       [('greek_temple', 9), ('greek_flag', 9), ('mario', 9), ('crown', 9), ('heart', 9), ('star', 9)],
    'greenpoint':    [('pierogi', 10), ('polish_flag', 9), ('sailboat', 9), ('coffee', 9), ('heart', 9), ('tree', 9)],
    'williamsburg':  [('coffee', 10), ('vinyl', 9), ('sunglasses', 9), ('mustache', 9), ('pikachu', 9), ('beer_mug', 9)],
    'bushwick':      [('bk_letters', 9), ('crown', 9), ('spray_can', 10), ('boombox', 9), ('star', 9), ('heart', 10)],
    'eastvillage':   [('lightning', 9), ('skull', 9), ('beer_mug', 9), ('cassette', 9), ('music_note', 10), ('spongebob', 9)],
    'midtown':       [('empire', 9), ('taxi', 9), ('heart', 10), ('pizza', 9), ('hot_dog', 9), ('liberty', 9)],
    'upperwestside': [('brownstone', 9), ('tree', 10), ('music_note', 10), ('snoopy', 10), ('coffee', 9), ('bagel', 10)],
}


def box_overlap(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return not (ax + aw <= bx or bx + bw <= ax or ay + ah <= by or by + bh <= ay)


def place_neighborhood(key, cx, cy, rng):
    pixels = {}
    plan = PLANS[key]
    placed = []
    BOX_HALF = 130  # 260x260 placement area
    for sprite_name, scale in plan:
        w, h = sprite_dims(sprite_name, scale)
        x_lo = cx - BOX_HALF
        x_hi = cx + BOX_HALF - w
        y_lo = cy - BOX_HALF
        y_hi = cy + BOX_HALF - h
        success = False
        for _ in range(200):
            ox = rng.randint(x_lo, x_hi)
            oy = rng.randint(y_lo, y_hi)
            if not any(box_overlap((ox, oy, w, h), b) for b in placed):
                placed.append((ox, oy, w, h))
                stamp(pixels, ox, oy, sprite_name, scale)
                success = True
                break
        if not success:
            # last-resort placement (allow overlap)
            ox = rng.randint(x_lo, x_hi)
            oy = rng.randint(y_lo, y_hi)
            placed.append((ox, oy, w, h))
            stamp(pixels, ox, oy, sprite_name, scale)
    return pixels


def main():
    rng = random.Random(42)
    out_dir = Path(__file__).parent
    grand_total = 0
    for key, (lat, lng) in NEIGHBORHOODS.items():
        cx, cy = lat_lng_to_world(lat, lng)
        pixels = place_neighborhood(key, cx, cy, rng)
        rows = [
            (x, y, color, f'demo-{key}')
            for (x, y), color in pixels.items()
            if 0 <= x < WORLD_WIDTH and 0 <= y < WORLD_HEIGHT
        ]
        grand_total += len(rows)
        out_path = out_dir / f'demo_seed_{key}.sql'
        BATCH = 1000  # rows per INSERT statement; many smaller statements parse faster than one huge one
        with out_path.open('w') as f:
            f.write(f'-- Demo seed: {key} ({len(rows)} rows in {(len(rows) + BATCH - 1) // BATCH} chunks)\n')
            f.write(f"-- Wipe just this one: DELETE FROM pixel_events WHERE session_id = 'demo-{key}';\n\n")
            for chunk_start in range(0, len(rows), BATCH):
                chunk = rows[chunk_start:chunk_start + BATCH]
                f.write("INSERT INTO pixel_events (x, y, color, session_id, input_mode) VALUES\n")
                values = [
                    f"  ({x}, {y}, '{color}', '{sid}', 't')"
                    for (x, y, color, sid) in chunk
                ]
                f.write(',\n'.join(values))
                f.write(';\n\n')
        print(f'  {key}: {len(rows)} pixels  ({len(plan_value(key))} sprites)  → {out_path.name}')
    print(f'total rows: {grand_total}')


def plan_value(key):
    return PLANS[key]


if __name__ == '__main__':
    main()
