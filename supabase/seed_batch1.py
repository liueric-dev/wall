#!/usr/bin/env python3
"""
Batch 1 seed: Long Island City, Astoria, East Village, Lower East Side.

Goals vs. previous demo seed:
- Expanded placement area (BOX_HALF 130 → 400, i.e. 800×800 px per neighborhood)
- 40 sprites per neighborhood (was 6), mix of large and small
- Background tile fills between sprites for ~10% density target
- Each sprite uses 3–5 palette colors for richer art
- Neighborhood-specific cultural references

Run:  python3 supabase/seed_batch1.py
Wipe: DELETE FROM pixel_events WHERE session_id IN (
        'demo-lic','demo-astoria_b1','demo-eastvillage_b1','demo-les');
"""
import random
from pathlib import Path

# ── projection (mirrors src/lib/coordinates.ts) ─────────────────────────────
NYC_SW = (40.4774, -74.2591)
NYC_NE = (40.9176, -73.7004)
LAT_SPAN = NYC_NE[0] - NYC_SW[0]
LNG_SPAN = NYC_NE[1] - NYC_SW[1]
WORLD_WIDTH  = round((LNG_SPAN * 273_000) / 10)
WORLD_HEIGHT = round((LAT_SPAN * 364_000) / 10)

# ── palette ───────────────────────────────────────────────────────────────────
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

NEIGHBORHOODS_BATCH1 = {
    'lic':              (40.7440, -73.9485),
    'astoria_b1':       (40.7721, -73.9302),
    'eastvillage_b1':   (40.7265, -73.9815),
    'les':              (40.7157, -73.9861),
}

def lat_lng_to_world(lat, lng):
    x = round(((lng - NYC_SW[1]) / LNG_SPAN) * WORLD_WIDTH)
    y = round(((lat - NYC_SW[0]) / LAT_SPAN) * WORLD_HEIGHT)
    return x, y


# ── sprite library ────────────────────────────────────────────────────────────

SPRITES = {

    # ══════════════════════════════════════════════════════════
    #  UNIVERSAL NYC SPRITES
    # ══════════════════════════════════════════════════════════

    'pigeon': """
        ....UUUU.....
        ...UUUUUU....
        ..UUUUUUUU...
        .UUUWWUUUUU..
        UUUUUUUUUUU..
        .UUUUUUUUU...
        ..UUUUUUU....
        ....OO.OO....
        .....OO......
    """,

    'water_tower': """
        .....KKK.....
        ....NNNNN....
        ...NNNNNNN...
        ..NNNNNNNNN..
        ..NKNNKNNKN..
        ..NNNNNNNNN..
        ..NNNNNNNNN..
        ...NNNNNNN...
        ....KKKKK....
        .....K.K.....
        .....K.K.....
        ....KK.KK....
        ....K...K....
        ...KK...KK...
    """,

    'fire_hydrant': """
        ...RRR...
        ..RRRRR..
        .RROORRR.
        RRRRRRRRR
        RROORRRRR
        RRRRRRRRR
        .RRRRRRR.
        .KKKKKKK.
        ...KKK...
    """,

    'heart': """
        .RR..RR.
        RRRRRRRR
        RRRRRRRR
        .RRRRRR.
        ..RRRR..
        ...RR...
    """,

    'star': """
        ...YY...
        ..YYYY..
        YYYYYYYY
        YYYYYYYY
        .YYYYYY.
        YYY..YYY
        YY....YY
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

    'pizza_slice': """
        .........N.
        ........NNN
        .......NRRRN
        ......NRRYRRN
        .....NRRRRRRN
        ....NRRRYRRR.
        ...NRRRRRRRR.
        ..NNNNNNNNNN.
    """,

    'skull': """
        ..WWWWWWW..
        .WWWWWWWWW.
        WWWWWWWWWWW
        WKK.KKK.KKW
        WKK.KKK.KKW
        WWWWWWWWWWW
        .WWWWWWWWW.
        .WKWKWKWKW.
        ..KWKWKWKW.
    """,

    'spray_can': """
        ..KK...
        .WKKKW.
        .WKKKW.
        KKKKKKK
        KRRRRK.
        KRRRRK.
        KRRRRK.
        KRRRRK.
        KRRRRK.
        KKKKKKK
    """,

    'music_note': """
        .....KK
        .KKKKKK
        KKKKKKK
        K......
        K......
        K......
        KKK....
        KKKK...
    """,

    'crown': """
        Y...YY...Y
        YY.YYYY.YY
        YYYYYYYYYY
        YYRRYYRRYY
        YYYYYYYYYY
        KKKKKKKKKK
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

    'boombox': """
        KKKKKKKKKKKKKK
        KWWWWWWWWWWWWK
        KW.KKKK.KKKKWK
        KW..KK...KKKWK
        KW..KK...KKKWK
        KW.KKK.KKKKKWK
        KKKKKKKKKKKKKK
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

    # ══════════════════════════════════════════════════════════
    #  BACKGROUND / FILL TILES  (large, low transparency)
    # ══════════════════════════════════════════════════════════

    # Brick wall — brown bricks with black mortar lines
    'brick_tile': """
        NNNNKNNNNNNKNNNN
        NNNNKNNNNNNKNNNN
        NNNNKNNNNNNKNNNN
        KKKKKKKKKKKKKKKK
        NNNNNNNKNNNNKNNNN
        NNNNNNNKNNNNKNNNN
        NNNNNNNKNNNNKNNNN
        KKKKKKKKKKKKKKKK
        NNNNKNNNNNNKNNNN
        NNNNKNNNNNNKNNNN
        NNNNKNNNNNNKNNNN
        KKKKKKKKKKKKKKKK
    """,

    # Sidewalk / cobblestone — offwhite stone with black cracks
    'cobble_tile': """
        WWWKWWWWKWWWKWWW
        WWWKWWWWKWWWKWWW
        WWWKWWWWKWWWKWWW
        KKKKKKKKKKKKKKKK
        WWWWWWKWWWWWKWWW
        WWWWWWKWWWWWKWWW
        KKKKKKKKKKKKKKKK
        WWWKWWWWKWWWKWWW
        WWWKWWWWKWWWKWWW
        KKKKKKKKKKKKKKKK
    """,

    # Park / grass — green field with yellow flower dots
    'grass_tile': """
        GGGGGGGGGGGGGGGGG
        GGGGGGGGGGGGGGGG.
        GGGGYGGGGGGGYGGG.
        GGGGGGGGGGGGGGGGG
        GGGGGGGGGGGGGGGGG
        GGGYGGGGGGGGGGGG.
        GGGGGGGGGGGGGGGGG
        GGGGGGGGYGGGGGGG.
        GGGGGGGGGGGGGGGGG
        GGGGGGGGGGGGGGGGG
        GGGGYGGGGGGGGGGG.
        GGGGGGGGGGGGGGGGG
    """,

    # Water / river — blue with white wave lines
    'water_tile': """
        BBBBBBBBBBBBBBBBB
        BWWWBBBBBBWWWBBBB
        BBBBBBBBBBBBBBBBB
        BBBWWWBBBBBBWWWBB
        BBBBBBBBBBBBBBBBB
        BWWWBBBBBBWWWBBBB
        BBBBBBBBBBBBBBBBB
        BBBWWWBBBBBBWWWBB
        BBBBBBBBBBBBBBBBB
    """,

    # Asphalt / road — dark with faint lane lines
    'road_tile': """
        KKKKKKKKKKKKKKKK
        KKKKKKKKKKKKKKKK
        KWKKKKKKKKKKKWKK
        KKKKKKKKKKKKKKKK
        KKKKKKKKKKKKKKKK
        KKKWKKKKKKKWKKKK
        KKKKKKKKKKKKKKKK
        KKKKKKKKKKKKKKKK
        KWKKKKKKKKKKKWKK
        KKKKKKKKKKKKKKKK
        KKKKKKKKKKKKKKKK
        KKKWKKKKKKKWKKKK
    """,

    # Checkerboard — red and yellow (colorful, festive)
    'checker_ry': """
        RYRYRYRYRYRYRYRYR
        YRYRYRYRYRYRYRYRR
        RYRYRYRYRYRYRYRYR
        YRYRYRYRYRYRYRYRR
        RYRYRYRYRYRYRYRYR
        YRYRYRYRYRYRYRYRR
        RYRYRYRYRYRYRYRYR
        YRYRYRYRYRYRYRYRR
        RYRYRYRYRYRYRYRYR
    """,

    # Polka dots — offwhite background, colored dots (colorful)
    'dots_blue': """
        WWWWWWWWWWWWWWWWWW
        WWBWWWWWBWWWWWBWWW
        WWWWWWWWWWWWWWWWWW
        WWWWWWWWWWWWWWWWWW
        WWWWWBWWWWWBWWWWWB
        WWWWWWWWWWWWWWWWWW
        WWWWWWWWWWWWWWWWWW
        WWBWWWWWBWWWWWBWWW
        WWWWWWWWWWWWWWWWWW
    """,

    # Striped — red and offwhite (American, festive)
    'stripes_rw': """
        RRRRRRRRRRRRRRRRR
        RRRRRRRRRRRRRRRRR
        WWWWWWWWWWWWWWWWW
        WWWWWWWWWWWWWWWWW
        RRRRRRRRRRRRRRRRR
        RRRRRRRRRRRRRRRRR
        WWWWWWWWWWWWWWWWW
        WWWWWWWWWWWWWWWWW
        RRRRRRRRRRRRRRRRR
        RRRRRRRRRRRRRRRRR
    """,

    # Purple/offwhite diagonal stripes (art deco / graffiti)
    'stripes_diag': """
        UUWWUUWWUUWWUUWWUU
        UWWUUWWUUWWUUWWUUW
        WWUUWWUUWWUUWWUUWW
        WUUWWUUWWUUWWUUWWU
        UUWWUUWWUUWWUUWWUU
        UWWUUWWUUWWUUWWUUW
        WWUUWWUUWWUUWWUUWW
        WUUWWUUWWUUWWUUWWU
        UUWWUUWWUUWWUUWWUU
    """,

    # ══════════════════════════════════════════════════════════
    #  LIC / ASTORIA SPECIFIC
    # ══════════════════════════════════════════════════════════

    'taxi': """
        ....YYYYYY....
        ...YYYYYYYY...
        ..YYWWYYYYYY..
        .YYYYYYYYYYYY.
        YYYYYYKYYYYYYY
        YKKYYYKYKYYYY.
        KKKKKKKKKKKKK.
        .KKK.KKK.KKK..
    """,

    'nyc_skyline': """
        .K..K.K..KK.K..K.K.
        KK.KKKK.KKK.KKKKKKK
        KK.KKKK.KKKKKKKWKKKK
        KKKKKKK.KKKKKKKWKKKK
        KKKKKKKKKKKKKKKWKKKK
        KKKKKWKKKKKKKKKWKKKK
        KKKKKKKKKKKKKKKKKKK.
    """,

    'queensboro': """
        .....K.....K.....
        ....KKK...KKK....
        ...KKKKK.KKKKK...
        ..KK.KKK.KKK.KK..
        .KK...KKKKK...KK.
        KK.....KKK.....KK
        KKKKKKKKKKKKKKKKK
        .K.K.K.K.K.K.K.K.
    """,

    'greek_columns': """
        WWWWWWWWWWWWW
        .W.W.W.W.W.W.
        .W.W.W.W.W.W.
        .W.W.W.W.W.W.
        .W.W.W.W.W.W.
        .W.W.W.W.W.W.
        .W.W.W.W.W.W.
        .W.W.W.W.W.W.
        WWWWWWWWWWWWW
        NNNNNNNNNNNNN
    """,

    'greek_flag': """
        BBBBBBBBBB
        WWWWWWWWWW
        BBBBBBBBBB
        WWWWWWWWWW
        BBBBBBBBBB
        WWWWWWWWWW
        BBBBBBBBBB
        WWWWWWWWWW
        BBBBBBBBBB
        WWWWWWWWWW
    """,

    'clapper': """
        KWWWWWWWWWWWK
        KKWKWKWKWKWKK
        WKWKWKWKWKWKW
        KKKKKKKKKKKK.
        KNNNNNNNNNNK.
        KNNNNNNNNNNK.
        KNNNNNNNNNNK.
        KNNNNNNNNNNK.
        KKKKKKKKKKK..
    """,

    'mets_cap': """
        .....BBBBBBB.....
        ....BBBBBBBBB....
        ...BBBOOOOOBBB...
        ..BBBOOOOOOBBB...
        .BBBBBBBBBBBBB...
        KBBBBBBBBBBBBBK..
        .KKKKKKKKKKKKKK..
        ....KKKKKKKKKK...
    """,

    'spiderman': """
        .BRRRRRRRRB..
        BRRRRRRRRRRB.
        RRBRBRBRBRRR.
        RRRRRRRRRRRR.
        RBBBBBBBBBBR.
        RBBBBBBBBBBR.
        RRRRRRRRRRRR.
        .RR......RR..
        RR........RR.
        R..........R.
    """,

    # Boat on water — Queens waterfront
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

    # Sun rays — bright yellow (summery/upbeat)
    'sun': """
        ...Y...Y...Y...
        ....Y..Y..Y....
        .....YYYYY.....
        Y.YYYYYYYYY.Y..
        ..YYYYYYYYYYY..
        Y.YYYYYYYYY.Y..
        .....YYYYY.....
        ....Y..Y..Y....
        ...Y...Y...Y...
    """,

    # Diamond shape — simple, bold
    'diamond': """
        ...BB...
        ..BBBB..
        .BBBBBB.
        BBBBBBBB
        BBBBBBBB
        .BBBBBB.
        ..BBBB..
        ...BB...
    """,

    # ══════════════════════════════════════════════════════════
    #  EAST VILLAGE / LOWER EAST SIDE SPECIFIC
    # ══════════════════════════════════════════════════════════

    'anarchy_a': """
        ....RRRR....
        ..RR....RR..
        .R....R...R.
        R....RRR...R
        R...RR.RR..R
        R.RRRRRRRR.R
        R.RR....RR.R
        .R..R..R..R.
        ..RR....RR..
        ....RRRR....
    """,

    'punk_marquee': """
        KKKKKKKKKKKKKKK
        KRRRRRRRRRRRRK.
        KWWWWWWWWWWWWK.
        KWKKKWWWKWWWWK.
        KWKWKWWWKW.WWK.
        KWKKKWWWKWWWWK.
        KWWWWWWWWWWWWK.
        KRRRRRRRRRRRRK.
        KKKKKKKKKKKKKK.
    """,

    'bagel_lox': """
        ....NNNNNN....
        ...NNNNNNNN...
        ..NNNNNNNNNN..
        .NN..PPPP..NN.
        NN.PPPPPPPP.NN
        NN.PPPPPPPP.NN
        .NN..PPPP..NN.
        ..NNNNNNNN....
        ...NNNNNN.....
    """,

    'menorah': """
        .Y.Y.Y.Y.Y.Y.Y.
        .Y.Y.Y.Y.Y.Y.Y.
        .Y.Y.Y.Y.Y.Y.Y.
        YYYYYYYYYYYYYYYY
        .......Y........
        .......Y........
        .......Y........
        ....YYYYYYY.....
        ....YYYYYYY.....
        ....YYYYYYY.....
    """,

    'guitar': """
        ....KK......
        ....KK......
        ....KK......
        ....KK......
        ...NNNN.....
        ..NNOONN....
        .NNOOOOONN..
        NNKOOOOKNN..
        .NNOOOOONN..
        ..NNOONN....
        ...NNNN.....
        ....KK......
        ....KK......
        ....KNNNNNN.
        ....KNNNNNN.
        ....KNNNNN..
        ....KNNNNNN.
        ....KKNNNNN.
        .....KNNNNK.
    """,

    'katz_sign': """
        RRRRRRRRRRR
        RYYYYYYYYYR
        RYYYYYYYYYR
        RRRRRRRRRRR
        K.YYYY.YYYY
        K.Y..Y.Y..Y
        K.YYYY.YYYY
        K.Y....Y..Y
        K.Y....Y..Y
        KKKKKKKKKKK
    """,

    'peace_sign': """
        ...GGGGG...
        ..G.....G..
        .G...G...G.
        G....G....G
        G....G....G
        G..GGGGG..G
        G.G.....G.G
        .GG.....GG.
        ..G.....G..
        ...GGGGG...
    """,

    'hotdog': """
        .NNNNNNNNNNN.
        NWWWWWWWWWWWN
        NWRRRRRRRRWWN
        NWYYRRRRRYWWN
        NWRRRRRRRRWWN
        NWWWWWWWWWWWN
        .NNNNNNNNNNN.
    """,

    'rat': """
        .UUUU.......
        .UUUUU......
        .UUUUUU.....
        UUUUKUUUU...
        UUWWUUUUU...
        UUUUUUUUU...
        .UUUUUUU....
        ..UUUUU.....
        ...UUUU.PPPP
        ....UUU.PRRP
        .......PRRP.
        ........PP..
    """,

    'star_of_david': """
        ...BBBBB...
        ..BBBBBBB..
        BBBBBBBBBBB
        .BBBBBBB..
        BBBBBBBBBBB
        ..BBBBBBB..
        ...BBBBB...
    """,

    'subway_token': """
        ...YYYYYY...
        ..YYYYYYYY..
        .YYYYYYYYYY.
        YYYY.YY.YYYY
        YYY.YYYY.YYY
        YYYY.YY.YYYY
        .YYYYYYYYYY.
        ..YYYYYYYY..
        ...YYYYYY...
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
}


# ── per-neighborhood plans ────────────────────────────────────────────────────
# Format: (sprite_name, scale)
# Background tiles placed first for density; sprites placed on top.

BG_LIC = [
    ('brick_tile',   5), ('brick_tile',   4), ('cobble_tile',  5),
    ('grass_tile',   5), ('water_tile',   5), ('cobble_tile',  4),
    ('road_tile',    5), ('grass_tile',   4), ('brick_tile',   5),
    ('dots_blue',    5), ('stripes_rw',   5), ('cobble_tile',  5),
]

BG_ASTORIA = [
    ('cobble_tile',  5), ('grass_tile',   5), ('brick_tile',   5),
    ('checker_ry',   4), ('cobble_tile',  4), ('grass_tile',   4),
    ('water_tile',   5), ('brick_tile',   4), ('road_tile',    4),
    ('stripes_diag', 5), ('dots_blue',    4), ('checker_ry',   5),
]

BG_EV = [
    ('road_tile',    5), ('brick_tile',   5), ('cobble_tile',  5),
    ('stripes_diag', 4), ('brick_tile',   4), ('road_tile',    4),
    ('checker_ry',   5), ('cobble_tile',  4), ('brick_tile',   5),
    ('stripes_rw',   4), ('dots_blue',    5), ('stripes_diag', 5),
]

BG_LES = [
    ('cobble_tile',  5), ('brick_tile',   5), ('grass_tile',   4),
    ('road_tile',    5), ('cobble_tile',  4), ('brick_tile',   4),
    ('checker_ry',   5), ('stripes_rw',   5), ('grass_tile',   5),
    ('stripes_diag', 4), ('dots_blue',    4), ('cobble_tile',  5),
]

ART_LIC = [
    ('queensboro',   5),
    ('nyc_skyline',  4),
    ('water_tower',  5), ('water_tower',  4),
    ('taxi',         5), ('taxi',         4),
    ('pigeon',       5), ('pigeon',       4), ('pigeon',       4),
    ('mets_cap',     4),
    ('spiderman',    4),
    ('clapper',      4),
    ('pizza_slice',  5),
    ('sun',          5),
    ('diamond',      5), ('diamond',      4),
    ('crown',        5),
    ('star',         5), ('star',         4),
    ('heart',        5), ('heart',        4),
    ('lightning',    5),
    ('coffee',       5),
    ('fire_hydrant', 5),
    ('sailboat',     5),
]

ART_ASTORIA = [
    ('greek_columns',5), ('greek_columns',4),
    ('greek_flag',   6), ('greek_flag',   5),
    ('clapper',      5), ('clapper',      4),
    ('mets_cap',     5),
    ('water_tower',  5), ('water_tower',  4),
    ('pigeon',       5), ('pigeon',       4), ('pigeon',       4),
    ('taxi',         4),
    ('peace_sign',   5),
    ('sun',          5),
    ('diamond',      5),
    ('crown',        5),
    ('coffee',       5),
    ('star',         6), ('star',         4),
    ('heart',        5), ('heart',        4),
    ('lightning',    5),
    ('fire_hydrant', 4),
    ('sailboat',     4),
]

ART_EV = [
    ('anarchy_a',    5), ('anarchy_a',    4),
    ('punk_marquee', 4),
    ('guitar',       4), ('guitar',       4),
    ('skull',        5), ('skull',        4),
    ('vinyl',        5), ('vinyl',        4),
    ('boombox',      4),
    ('spray_can',    5), ('spray_can',    4),
    ('peace_sign',   5),
    ('crown',        5), ('crown',        4),
    ('music_note',   5), ('music_note',   4),
    ('lightning',    5),
    ('cassette',     5),
    ('beer_mug',     5),
    ('pigeon',       4),
    ('rat',          4),
    ('star',         5),
    ('heart',        4),
]

ART_LES = [
    ('bagel_lox',    5), ('bagel_lox',    4),
    ('menorah',      4), ('menorah',      5),
    ('katz_sign',    4), ('katz_sign',    5),
    ('hotdog',       5), ('hotdog',       4),
    ('rat',          4), ('rat',          4),
    ('star_of_david',5), ('star_of_david',4),
    ('fire_hydrant', 5),
    ('subway_token', 5),
    ('peace_sign',   4),
    ('crown',        5),
    ('skull',        4),
    ('spray_can',    4),
    ('pigeon',       4),
    ('heart',        5),
    ('star',         4),
    ('lightning',    4),
    ('coffee',       4),
]

PLANS = {
    'lic':              BG_LIC   + ART_LIC,
    'astoria_b1':       BG_ASTORIA + ART_ASTORIA,
    'eastvillage_b1':   BG_EV    + ART_EV,
    'les':              BG_LES   + ART_LES,
}


# ── rendering helpers ─────────────────────────────────────────────────────────

def normalize_art(name):
    raw = SPRITES[name].strip('\n').splitlines()
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


def box_overlap(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return not (ax + aw <= bx or bx + bw <= ax or ay + ah <= by or by + bh <= ay)


def place_neighborhood(key, cx, cy, rng):
    pixels = {}
    plan = PLANS[key]
    placed = []
    BOX_HALF = 400   # 800×800 px fill zone

    for sprite_name, scale in plan:
        w, h = sprite_dims(sprite_name, scale)
        x_lo = cx - BOX_HALF
        x_hi = max(x_lo + 1, cx + BOX_HALF - w)
        y_lo = cy - BOX_HALF
        y_hi = max(y_lo + 1, cy + BOX_HALF - h)

        success = False
        for _ in range(400):
            ox = rng.randint(x_lo, x_hi)
            oy = rng.randint(y_lo, y_hi)
            if not any(box_overlap((ox, oy, w, h), b) for b in placed):
                placed.append((ox, oy, w, h))
                stamp(pixels, ox, oy, sprite_name, scale)
                success = True
                break

        if not success:
            # last resort: allow overlap (happens only when area is very full)
            ox = rng.randint(x_lo, x_hi)
            oy = rng.randint(y_lo, y_hi)
            placed.append((ox, oy, w, h))
            stamp(pixels, ox, oy, sprite_name, scale)

    return pixels


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    rng = random.Random(7)
    out_dir = Path(__file__).parent
    grand_total = 0

    for key, (lat, lng) in NEIGHBORHOODS_BATCH1.items():
        cx, cy = lat_lng_to_world(lat, lng)
        pixels = place_neighborhood(key, cx, cy, rng)
        rows = [
            (x, y, color, f'demo-{key}')
            for (x, y), color in pixels.items()
            if 0 <= x < WORLD_WIDTH and 0 <= y < WORLD_HEIGHT
        ]
        grand_total += len(rows)

        out_path = out_dir / f'demo_seed_{key}.sql'
        BATCH = 1000
        with out_path.open('w') as f:
            f.write(f'-- Batch 1 seed: {key} ({len(rows):,} rows)\n')
            f.write(f"-- Wipe: DELETE FROM pixel_events WHERE session_id = 'demo-{key}';\n\n")
            for chunk_start in range(0, len(rows), BATCH):
                chunk = rows[chunk_start:chunk_start + BATCH]
                f.write("INSERT INTO pixel_events (x, y, color, session_id, input_mode) VALUES\n")
                values = [
                    f"  ({x}, {y}, '{color}', '{sid}', 't')"
                    for (x, y, color, sid) in chunk
                ]
                f.write(',\n'.join(values))
                f.write(';\n\n')

        print(f'  {key}: {len(rows):,} pixels  ({len(PLANS[key])} sprites)  → {out_path.name}')

    print(f'  ─────────────────────────────────────────────────────')
    print(f'  total: {grand_total:,} pixels across {len(NEIGHBORHOODS_BATCH1)} neighborhoods')


if __name__ == '__main__':
    main()
