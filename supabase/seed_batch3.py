#!/usr/bin/env python3
"""
Batch 3 seed: max 1× per neighborhood, more whimsical, on-land only, citywide NSFW.

Improvements over batch 2:
- Each sprite used exactly once per neighborhood (was max 2)
- 40% whimsical/fun sprites (cute emojis, food faces, animals, internet memes)
- 50% of sprites sized 20×20–50×50 px (scale 4–5 with 5–10 char art)
- Land-only placement: each candidate position is checked against NYC borough
  polygons (parsed from src/data/nycGeo.ts) — sprites won't render over rivers
- Citywide NSFW sprites scattered randomly (session_id 'demo-nsfw-b3' so they
  can be detected & deleted easily)

Run:
  python3 supabase/seed_batch3.py            # generate SQL files only
  python3 supabase/seed_batch3.py --insert   # wipe old & insert via supabase-py
"""
import argparse
import json
import os
import random
import re
import sys
from collections import Counter
from pathlib import Path

# ── projection ────────────────────────────────────────────────────────────────
NYC_SW = (40.4774, -74.2591)
NYC_NE = (40.9176, -73.7004)
LAT_SPAN = NYC_NE[0] - NYC_SW[0]
LNG_SPAN = NYC_NE[1] - NYC_SW[1]
WORLD_WIDTH  = round((LNG_SPAN * 273_000) / 10)
WORLD_HEIGHT = round((LAT_SPAN * 364_000) / 10)


def lat_lng_to_world(lat, lng):
    x = round(((lng - NYC_SW[1]) / LNG_SPAN) * WORLD_WIDTH)
    y = round(((lat - NYC_SW[0]) / LAT_SPAN) * WORLD_HEIGHT)
    return x, y


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


# ── neighborhoods ─────────────────────────────────────────────────────────────
NEIGHBORHOODS = {
    'lic-b3':         (40.7440, -73.9485),
    'astoria-b3':     (40.7721, -73.9302),
    'eastvillage-b3': (40.7265, -73.9815),
    'les-b3':         (40.7157, -73.9861),
}

OLD_SESSIONS_TO_WIPE = [
    # batch 1
    'demo-lic', 'demo-astoria_b1', 'demo-eastvillage_b1', 'demo-les',
    # batch 2
    'demo-lic-b2', 'demo-astoria-b2', 'demo-eastvillage-b2', 'demo-les-b2',
    # batch 3 (in case re-run)
    'demo-lic-b3', 'demo-astoria-b3', 'demo-eastvillage-b3', 'demo-les-b3',
    'demo-nsfw-b3',
]


# ── land polygon parsing ──────────────────────────────────────────────────────
# Parse NYC_BOROUGHS from src/data/nycGeo.ts and convert each vertex
# from [lng, lat] to world (x, y) for fast point-in-polygon tests.

def load_borough_polygons_world():
    repo = Path(__file__).resolve().parent.parent
    text = (repo / 'src/data/nycGeo.ts').read_text()
    m = re.search(r'export const NYC_BOROUGHS[^=]*=\s*(\{.*?\n\})', text, re.DOTALL)
    if not m:
        raise RuntimeError('Could not parse NYC_BOROUGHS from nycGeo.ts')
    body = m.group(1)
    body = re.sub(r'^(\s+)(\w+):', r'\1"\2":', body, flags=re.MULTILINE)
    raw = json.loads(body)
    # Convert all rings to world space
    polys = []  # list of list-of-(x,y) rings
    for borough, rings in raw.items():
        for ring in rings:
            poly_xy = [lat_lng_to_world(lat, lng) for lng, lat in ring]
            polys.append(poly_xy)
    return polys


def point_in_polygon(x, y, poly):
    """Ray-casting point-in-polygon. poly is list of (x, y) tuples."""
    n = len(poly)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def is_on_land(x, y, polys):
    for poly in polys:
        if point_in_polygon(x, y, poly):
            return True
    return False


def sprite_on_land(ox, oy, w, h, polys, samples=3):
    """Check if a sprite's bounding box is on land by sampling points.
    samples=3 → check center + 4 corners + 4 edge mids = a robust 9-point grid."""
    pts = []
    for sy in range(samples + 1):
        for sx in range(samples + 1):
            px = ox + (w * sx) // samples
            py = oy + (h * sy) // samples
            pts.append((px, py))
    return all(is_on_land(px, py, polys) for px, py in pts)


# ════════════════════════════════════════════════════════════════════════════
#  SPRITE LIBRARY  (batch2 keepers + lots of new whimsical + NSFW)
# ════════════════════════════════════════════════════════════════════════════

SPRITES = {

    # ──────────────────────────────────────────────────────────
    #  WHIMSICAL / FUN  — used across neighborhoods (1× each)
    # ──────────────────────────────────────────────────────────

    'smiley': """
        ..YYYYY..
        .YYYYYYY.
        YYYKYKYYY
        YYYYYYYYY
        YYYKYKYYY
        YKYYKYYKY
        .YKKKKKY.
        ..YYYYY..
    """,
    'heart_eyes': """
        .YYYYYYY.
        YYYYYYYYY
        YYRYYYRYY
        YRRRYRRRY
        YRRRRRRRY
        YYRRRRYYY
        YYKYKYKYY
        YYYKKYYYY
        .YYYYYYY.
    """,
    'cool_face': """
        .YYYYYYY.
        YYYYYYYYY
        KKKKKKKKK
        KBBKKKBBK
        KKKKKKKKK
        YYYYYYYYY
        YYKKKKKYY
        .YYYYYYY.
    """,
    'party_face': """
        ..R......
        .RRR.....
        RRRYYYY..
        .YYYYYYY.
        YYKYYKYYY
        YYYYYYYYY
        YKYYYYYKY
        YYKKKKKYY
        .YYYYYYY.
    """,
    'crying_laugh': """
        .YYYYYYY.
        YYYYYYYYY
        YBKBYBKBY
        YBBBYBBBY
        YYYYYYYYY
        YYKKKKKYY
        YKKKKKKKY
        BYYYYYYYB
        .YYYYYYY.
    """,
    'cute_pizza': """
        .........N..
        ........NNN.
        .......NRRRN
        ......NRYYRR
        .....NRWWRRR
        ....NRRRRWRR
        ...NRRWRRRRR
        ..NRYRRRWRRR
        .NRRRRRRRRRR
        NNNNNNNNNNN.
    """,
    'cute_donut': """
        ..PPPPPP..
        .PYPYPYPP.
        PPPP..PYPP
        PPPK..KPPP
        PPPK..KYPP
        PPPP..PPPP
        .PPPPPPYP.
        ..PPPPPP..
    """,
    'cute_avocado': """
        ..GGGGG..
        .GGGGGGG.
        GGGGGGGGG
        GGNNNNNGG
        GGNKKKNGG
        GGNNNNNGG
        GGGGGGGGG
        .GGGGGGG.
        ..GGGGG..
    """,
    'cute_banana': """
        .........Y
        ........YY
        ......YYYY
        ....YYYYY.
        ..YYYYYY..
        YYYYYYY...
        YKYK......
        YKYK......
        YYYY......
    """,
    'cute_lemon': """
        ...YYY...
        ..YYYYY..
        .YYYYYYY.
        YYKYYKYYY
        YYYYYYYYY
        YYYKKKYYY
        .YYYYYYY.
        ..YYYYY..
        ...NNN...
    """,
    'cute_cat': """
        K.K....K.K
        KK......KK
        KKWWWWWWKK
        KWWKKKKWWK
        KWKWKWKWKW
        KWWWKWWWWK
        KKWWWWWWWK
        .KKKKKKKKK
        ..KKKKKKK.
    """,
    'cute_dog': """
        N.......N.
        NN.....NN.
        NNN...NNN.
        NNNNNNNNN.
        WWNKWWKNW.
        WWWWNWWWW.
        WWWWNWWWW.
        WWWKKKWWW.
        .WWWWWWWW.
    """,
    'cute_robot': """
        ..KKKKK..
        ..KWWWK..
        WKKKKKKKW
        WKBBBBBKW
        WKBKWWBKW
        WKBBBBBKW
        WKKKKKKKW
        ..KK.KK..
        ..KK.KK..
        .KKK.KKK.
    """,
    'cute_alien': """
        ..GGGGG..
        .GGGGGGG.
        GGGWGWGGG
        GGGKGKGGG
        GGGGGGGGG
        GGGKKKGGG
        GGGGGGGGG
        .GG.G.GG.
        .G..G..G.
    """,
    'cute_ghost': """
        ..WWWWW..
        .WWWWWWW.
        WWWWWWWWW
        WWKWWWKWW
        WWWWWWWWW
        WWWWWWWWW
        WWWPWWPWW
        WWWWWWWWW
        WWW.W.WWW
        .W.W.W.W.
    """,
    'cute_ufo': """
        ..KKKKKK..
        .KWWWWWWK.
        KKBBBBBBKK
        KWWWWWWWWK
        KKKKKKKKKK
        ..YY...YY.
        .YYY...YYY
        YYY.....YY
    """,
    'cute_unicorn': """
        ..Y......
        .YYY.....
        WW.WW....
        WWWWWWW..
        WWKWWWWPP
        WWWWWWWPP
        WWWWWWWWW
        WW.WW.WW.
    """,
    'cute_pepe': """
        ..GGGGG..
        .GGGGGGG.
        GGGGGGGGG
        GGWGWWGWG
        GGKGGKGGG
        GGGNGNGGG
        GGGGGGGGG
        GGNNNNGGG
        .GGGGGGG.
    """,
    'cute_doge': """
        ..NNNN....
        .NWWWNN...
        NWWWWWNN..
        NWKWKWWNN.
        NWWWNWWWN.
        NWNNNNWWN.
        .NWWWWWNN.
        ..NNNNN...
    """,
    'mushroom': """
        ..RRRRR..
        .RRWRWRR.
        RRRRRRRRR
        RRWRRRWRR
        RRRRRRRRR
        .RRRRRRR.
        ..WWWWW..
        ..WNNNW..
        ..WNNNW..
    """,
    'rainbow': """
        .RRRRRRRR.
        RROOOOOOOR
        RROYYYYYOR
        RROYGGGGYO
        RROYGBBBGY
        ..GBUUUBG.
        .........
    """,
    'disco_ball': """
        ..WWWWW..
        .WUWUWUW.
        WUWUWUWUW
        WWUWUWUWW
        WUWWWWWUW
        WWUWUWUWW
        WUWUWUWUW
        .WUWUWUW.
        ..WWWWW..
    """,
    'soccer_ball': """
        .WWWWWWW.
        WWKWKWKWW
        WKKWWWKKW
        WWWKKKWWW
        WKWKWKWKW
        WWWKKKWWW
        WKKWWWKKW
        WWKWKWKWW
        .WWWWWWW.
    """,
    'basketball': """
        .OOOOOOO.
        OOKOOKOOO
        OKOOKOOKO
        OOOOOOOOO
        KKKKKKKKK
        OOOOOOOOO
        OKOOKOOKO
        OOKOOKOOO
        .OOOOOOO.
    """,
    'lightbulb': """
        ..YYY..
        .YYYYY.
        YYYYYYY
        YYWYWYY
        YYYYYYY
        .YYYYY.
        ..KKK..
        .KWKWK.
        ..KKK..
    """,
    'cherry': """
        ......G..
        .....GG..
        ....GG...
        ...GG....
        ..RR.RR..
        .RRR.RRR.
        RRRRRRRRR
        RRWRRRWR.
        .RRRRRRR.
        ..RRRRR..
    """,
    'watermelon': """
        GGGGGGGGGG
        GWWWWWWWWG
        WRRRRRRRRW
        WRKRKRKRRW
        WRRRKRRKRW
        WRKRRRRKRW
        .WRRRRRRW.
        ..WWWWWW..
    """,
    'cupcake': """
        .PPPPPP.
        PPPRPPPP
        PPPYRPPP
        PPPPPPP.
        NNNNNNN.
        NWWWWWN.
        NWNWNWN.
        NWNWNWN.
        NNNNNNN.
    """,
    'pumpkin': """
        ....G....
        ...GG....
        ..OOOOO..
        .OOOOOOO.
        OOOOKOOOO
        OOKOKOKOO
        OOKKKKKOO
        OOOOOOOOO
        .OOOOOOO.
        ..OOOOO..
    """,
    'snowman': """
        ..KKKKK..
        ..KWWWK..
        ..KWKWK..
        ..KWWWK..
        ..KKKKK..
        .WWWWWWW.
        WWWNWNWWW
        WWWWWWWWW
        .WWWWWWW.
    """,
    'frog_cartoon': """
        ..WW.WW..
        .WGWGWGW.
        WGGKGKGGW
        GGGGGGGGG
        GGGGRGGGG
        GGGGGGGGG
        .GGGGGGG.
        ..GGGGG..
        .GG...GG.
    """,
    'octopus_cute': """
        ..PPPPP..
        .PPPPPPP.
        PPKPPPKPP
        PPPPPPPPP
        PPPPRPPPP
        PPPPPPPPP
        .P.P.P.P.
        P.P.P.P.P
    """,
    'penguin_cute': """
        ..KKKKK..
        .KWWWWWK.
        KWWKWKWWK
        KWWWOWWWK
        KKWWWWWKK
        KKWWWWWKK
        KKKKKKKKK
        ..OO.OO..
    """,
    'bee_cute': """
        ..WW.WW..
        .WWWWWWW.
        WWYKYKYWW
        WYYYKYYYW
        WYYKKKYYW
        WYYYKYYYW
        .WYKYKYW.
        ..WWWWW..
    """,
    'rubber_duck': """
        ..YYYY...
        .YYYWYY..
        YYYWKWYY.
        YYYYYYYY.
        .YYYYYYYY
        OYYYYYYY.
        OOYYYYY..
        ..OOO....
    """,
    'sushi_face': """
        WWWWWWWWWW
        WPPPPPPPPW
        WPKWPPWPPW
        WPPPPPPPPW
        WPPPKKPPPW
        WPPPPPPPPW
        WGGGGGGGGW
        WWWWWWWWWW
    """,
    'cactus': """
        ..G......
        .GGG.....
        GGGG..G..
        GGGG.GG..
        GGGGGGGG.
        GGGKGGGG.
        .GGGGGGG.
        ..GGGGG..
        ..NNNNN..
    """,

    # ──────────────────────────────────────────────────────────
    #  NSFW  — citywide, special session for easy deletion
    # ──────────────────────────────────────────────────────────

    'nsfw_finger': """
        .NNN.....
        NNWNN....
        NNWNN....
        NNWNN....
        NNWNNNN..
        NNWNNNNN.
        NWWWWNNNN
        NWWWWWNNN
        NWWWWWWNN
        NNWWWWWNN
        .NNNNNNNN
    """,
    'nsfw_eggplant': """
        .....G...
        ....GG...
        ...GGG...
        ..UUUUU..
        .UUUUUUU.
        UUUUUUUUU
        UUWUUUUUU
        UUUUUUUUU
        UUUUUUUUU
        .UUUUUUU.
        ..UUUUU..
    """,
    'nsfw_peach': """
        ..G..G...
        ..GGGG...
        ..PPPPP..
        .PPPPPPP.
        PPPKPPKPP
        PPPPPPPPP
        PPP.K.PPP
        PP.....PP
        PPPPPPPPP
        .PPPPPPP.
        ..PPPPP..
    """,
    'nsfw_wine': """
        ..R...R..
        ..RRRRR..
        ..RRRRR..
        ..RRRRR..
        ..RRRRR..
        ..WRRRW..
        ...WRW...
        ....W....
        ....W....
        ....W....
        ..WWWWW..
        ..WWWWW..
    """,
    'nsfw_beer': """
        .KK.....
        .KK.....
        WWWWW...
        NNNNN...
        NWWWN...
        NNNNN...
        NWWWN...
        NNNNN...
        NWWWN...
        NNNNN...
    """,
    'nsfw_cig': """
        .........K
        .WWWWWWWWW
        .WRWWWWWWW
        .WWWWWWWWW
        ..K......K
    """,
    'nsfw_devil': """
        R...R...R
        RR.RRR.RR
        .RRRRRRR.
        RRWRRRWRR
        RRRRRRRRR
        RRR.K.RRR
        RRKKKKKRR
        RRWWWWWRR
        .RRRRRRR.
    """,
    'nsfw_butt': """
        .PPPPPPPPP.
        PPPPPPPPPPP
        PPPPPPPPPPP
        PPKKPPPPKKP
        PPPPPPPPPPP
        PPPPP.PPPPP
        PPPP...PPPP
        PPPPP.PPPPP
        PPPPPPPPPPP
        .PPPPPPPPP.
    """,
    'nsfw_boobs': """
        .PPPP..PPPP.
        PPPPPP.PPPPP
        PPPPPPPPPPPP
        PPRPPP.PPPRP
        PPPPPP.PPPPP
        .PPPP..PPPP.
    """,
    'nsfw_lipkiss': """
        ..RR..RR..
        .RRRRRRRR.
        RRRRRRRRRR
        RRRRRRRRRR
        .RRRRRRRR.
        ..RRRRRR..
        ...RRRR...
        ....RR....
    """,
    'nsfw_69': """
        OOOOO.OOOO
        OOOOO.OOOO
        OO....OOOO
        OOOO..OOOO
        OOOO..OO..
        OOOO..OOOO
        OOOO....OO
        OOOO.OOOOO
        OOOO.OOOOO
    """,
    'nsfw_skull_xbones': """
        ..KKKKKKK..
        .KKKKKKKKK.
        KWWKKKKKWWK
        KWKKKKKKKWK
        KKKKKKKKKKK
        K.KKKKK.KKK
        K.KKK.K.KKK
        N.KKKKK..NN
        NN.KKK..NN.
        NNN.K..NN..
        NNNN.NNN...
    """,

    # ──────────────────────────────────────────────────────────
    #  LIC SPECIFIC (kept from batch 2)
    # ──────────────────────────────────────────────────────────

    'lic_pepsi': """
        ..RRRRRRRRRRRRRR..
        .RRRRRRRRRRRRRRRR.
        RRRRWWWRRWWWRRRRRR
        RRRWBBBWWBBBWBBBRR
        RRRWB.BWWB.BWB..RR
        RRRWBBBWWB.BWBBBRR
        RRRWB..WWB.BWB..RR
        RRRWB..WWBBBWBBBRR
        RRRRRRRRRRRRRRRRRR
        BBBBBBBBBBBBBBBBBB
        BBWWWBBWBBBBWBBBBB
        BBWB.BBWBBBBWB.BBB
        BBWBBBBWBBBBWBBBBB
        BBWB..BWBBBBWB.BBB
        BBWB..BWWWWBWB.BBB
        BBBBBBBBBBBBBBBBBB
        .BBBBBBBBBBBBBBBB.
        ..BBBBBBBBBBBBBB..
    """,
    'lic_citi_field': """
        .....BBBBBBBBBBBB.....
        ....BBBBBBBBBBBBBB....
        ...BBBOOOOOOOOOOBBB...
        ..BBBBBBBBBBBBBBBBBB..
        .BBBBOOBBBBBBBBOOBBBB.
        BBBBBBBBBBBBBBBBBBBBB
        BBOOBBBBBBBBBBBBBBOOBB
        BBBBBBBBBBBBBBBBBBBBBB
        WWWWWWWWWWWWWWWWWWWWW
        BBBBBBBBBBBBBBBBBBBBB
        BWBWBWBWBWBWBWBWBWBWB
        BBBBBBBBBBBBBBBBBBBBB
    """,
    'lic_queensboro': """
        ......K..K............K..K......
        .....KKKKK............KKKKK.....
        ....KK.KKK............KKK.KK....
        ...KKK..KK............KK..KKK...
        ..KKKK..KK............KK..KKKK..
        .KKKKKK.KK............KK.KKKKKK.
        KKKKKKKKKK............KKKKKKKKKK
        KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
        KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
        K.K.K.K.K.K.K.K.K.K.K.K.K.K.K.K.
    """,
    'lic_tram': """
        ......KKKKKKKKKK......
        .....KKKKKKKKKKKK.....
        ....KKKKKKKKKKKKKK....
        ...KK..........KKK....
        ..KKK.RRRRRRRRR.KKK...
        ..KK.RRRRRRRRRRR.KK...
        ..KK.RRWWRWWRWWRR.KK..
        ..KK.RWWWRWWWRWWR.KK..
        ..KK.RWWWRWWWRWWR.KK..
        ..KK.RWWWRWWWRWWR.KK..
        ..KK.RRWWRWWRWWRR.KK..
        ..KK.RRRRRRRRRRR.KK...
        ..KKKKKKKKKKKKKKKKK...
        ...KK..........KK.....
        ....KKKKKKKKKKKK......
    """,
    'lic_moma_ps1': """
        KKKKKKKKKKKKKKKK
        KWWWWWWWWWWWWWWK
        KW.W.W.W.W.W.WWK
        KW............WK
        KW.YYYYYYYYYY.WK
        KW.Y........Y.WK
        KW.Y.KKKKKK.Y.WK
        KW.Y.K....K.Y.WK
        KW.Y.K....K.Y.WK
        KW.Y.K....K.Y.WK
        KW.Y.KKKKKK.Y.WK
        KW.YYYYYYYYYY.WK
        KW............WK
        KW.W.W.W.W.W.WWK
        KWWWWWWWWWWWWWWK
        KKKKKKKKKKKKKKKK
    """,
    'lic_silvercup': """
        RRRRRRRRRRRRRRRR
        RYYYYYYYYYYYYYYR
        RYRRRRRRRRRRRRYR
        RYRYYRYRRRYYRRYR
        RYRYRRYRRYRRRRYR
        RYRYYYYRRYYRRRYR
        RYRYRRYRRRRYRRYR
        RYRYRRYRRYYYRRYR
        RYRRRRRRRRRRRRYR
        RYYYYYYYYYYYYYYR
        RRRRRRRRRRRRRRRR
    """,
    'lic_water_tower': """
        ....WWWW....
        ...WWWWWW...
        ..WWWKWKWW..
        ..WWWWWWWW..
        ..WKWKWKWW..
        ..WWWWWWWW..
        ...WWWWWW...
        ....KKKK....
        ....K..K....
        ...KK..KK...
        ...K....K...
        ..KK....KK..
    """,
    'lic_subway_7': """
        .UUUUU.
        UUUUUUU
        UWWWWWU
        UU..WUU
        UU.WUUU
        UU.WUUU
        UWWWWWU
        UUUUUUU
        .UUUUU.
    """,
    'lic_subway_g': """
        .GGGGG.
        GGGGGGG
        GWGGWWG
        GW.GGGG
        GW.WWGG
        GW.GGWG
        GWWWGGG
        GGGGGGG
        .GGGGG.
    """,
    'lic_mr_met': """
        ...BBBBBB...
        ..BBBBBBBBB.
        .BBOOOOOOBB.
        WWWWWWWWWWWW
        WWKWWWWKWWWW
        WWKWWWWKWWWW
        WWWWWWWWWWWW
        WWW.KKKK.WWW
        WWWWWWWWWWWW
        .WWWWWWWWWW.
        ..WWWWWWWW..
    """,
    'lic_mets_cap': """
        ...BBBBBBB...
        ..BBBBBBBBB..
        .BBBOOOOOBBB.
        BBBOOOOOOOBBB
        BBBBBBBBBBBBB
        KBBBBBBBBBBBK
        .KKKKKKKKKKK.
        ...KKKKKKK...
    """,
    'lic_taxi_front': """
        .YYYYYYYYY.
        YYWWWWWWWYY
        YWWWWWWWWWY
        YYYYYYYYYYY
        KKKKYKKYKKKKK
        K.YK..YKY..K
        K.KK..K.K..K
        KKKKKKKKKKKK
    """,
    'lic_taxi_side': """
        ....YYYYYY....
        ...YYYYYYYY...
        ..YYWWYYYYYY..
        .YYYYYYYYYYYY.
        YYYYYYKYYYYYYY
        YKKYYYKYKYYYY.
        KKKKKKKKKKKKK.
        .KKK.KKK.KKK..
    """,
    'lic_pigeon': """
        ....UU....
        ...UUUU...
        ..UUUUUU..
        .UUUUUUUU.
        UUUWUUUUUU
        .UUUUUUUU.
        ..UUUUUU..
        ...OOOO...
        ...OOOO...
    """,
    'lic_spiderman': """
        .RRRRRRRR.
        RRRRRRRRRR
        RRBBBBBBRR
        RRBKWKWKBR
        RRBBBBBBBR
        RBBBBBBBBR
        RBBBBBBBBR
        RBBBBBBBBR
        RRRRRRRRRR
        .RRR..RRR.
        RR......RR
        R........R
    """,
    'lic_pizza': """
        ........N..
        .......NNN.
        ......NRRRN
        .....NRRYRR
        ....NRRRRRR
        ...NRRYRRRR
        ..NRRRRRRYR
        .NRRRRRRRRR
        NNNNNNNNNNN
    """,
    'lic_lighthouse': """
        ..Y..
        .YYY.
        WKWKW
        WWKWW
        RRRRR
        WWWWW
        RRRRR
        WWWWW
        WWWWW
        KKKKK
    """,
    'lic_warehouse': """
        NNNNNNNNNNNNNN
        NWWNWWNWWNWWNN
        NWWNWWNWWNWWNN
        NNNNNNNNNNNNNN
        NWWNWWNWWNWWNN
        NWWNWWNWWNWWNN
        NNNNNNNNNNNNNN
        NWWWWWWWWWWWWN
        NWKKKWWKKKWWWN
        NWKKKWWKKKWWWN
        NNNNNNNNNNNNNN
    """,
    'lic_smokestack': """
        ..WWW...
        .WWWWW..
        WWWWWWW.
        .WWWWW..
        ..WWW...
        ..NNN...
        ..NKN...
        ..NNN...
        ..NKN...
        ..NNN...
        ..NKN...
        ..NNN...
        .NNNNN..
        NNNNNNN.
    """,
    'lic_gantry': """
        KKKKKKKKKKKK.
        K..........K.
        K..........K.
        KKKKKKKKKKKK.
        ......KK.....
        ......KK.....
        ......KK.....
        ......KK.....
        ....KKKKKK...
    """,
    'lic_crane': """
        YYYYYYYYYYY
        Y.........Y
        YYYYYYYYYYY
        ....Y......
        ....Y......
        ....Y......
        ....Y......
        ....Y......
        ...YYY.....
        ..YYYYY....
    """,

    # ──────────────────────────────────────────────────────────
    #  ASTORIA SPECIFIC (kept from batch 2)
    # ──────────────────────────────────────────────────────────

    'astoria_parthenon': """
        .........YYYYY..........
        ........YYYYYYY.........
        .......YYYYYYYYY........
        ......YYYYYYYYYYY.......
        .....YYYYYYYYYYYYY......
        ....YYYYYYYYYYYYYYY.....
        WWWWWWWWWWWWWWWWWWWWWWWW
        WWWWWWWWWWWWWWWWWWWWWWWW
        .W.W.W.W.W.W.W.W.W.W.W..
        .W.W.W.W.W.W.W.W.W.W.W..
        .W.W.W.W.W.W.W.W.W.W.W..
        .W.W.W.W.W.W.W.W.W.W.W..
        .W.W.W.W.W.W.W.W.W.W.W..
        .W.W.W.W.W.W.W.W.W.W.W..
        .W.W.W.W.W.W.W.W.W.W.W..
        WWWWWWWWWWWWWWWWWWWWWWWW
        NNNNNNNNNNNNNNNNNNNNNNNN
    """,
    'astoria_hellgate': """
        ..........RRRRRRRR..........
        ........RRRRRRRRRRR.........
        ......RRRRRRRRRRRRRRR.......
        ....RRRR..........RRRR......
        ...RRR....RRRRRR....RRR.....
        ..RRR...RRR....RRR...RRR....
        .RRR..RRR........RRR..RRR...
        RRR..RRR..........RRR..RRR..
        RRRRRR..............RRRRRRR.
        KKKKKKKKKKKKKKKKKKKKKKKKKKKK
        K.K.K.K.K.K.K.K.K.K.K.K.K.K.
    """,
    'astoria_caryatid': """
        ....NNNN....
        ...NNNNNN...
        ..NNNWWNNN..
        ..NWWWWWWN..
        ..NWKKWWKN..
        ..NWWWWWWN..
        ..NWWNWWWN..
        ..NWWWWWWN..
        ...NNNNNN...
        ....NNNN....
        ....WWWW....
        ...WWWWWW...
        ..W.W.W.W...
        ..W.W.W.W...
        ..W.W.W.W...
        ..W.W.W.W...
        ..W.W.W.W...
        ..W.W.W.W...
        ...WWWWWW...
        ...NNNNNN...
    """,
    'astoria_temple': """
        ......WWW......
        .....WWWWW.....
        ....WWWWWWW....
        ...WWWWWWWWW...
        ..WWWWWWWWWWW..
        WWWWWWWWWWWWWWW
        WWWWWWWWWWWWWWW
        .W.W.W.W.W.W.W.
        .W.W.W.W.W.W.W.
        .W.W.W.W.W.W.W.
        .W.W.W.W.W.W.W.
        WWWWWWWWWWWWWWW
        NNNNNNNNNNNNNNN
    """,
    'astoria_olive': """
        ............G.
        ...........GG.
        ..G......GGG..
        ..GG.GGGGGG...
        ..GGGGGGGG....
        ..GGGGOG......
        ..GG.OG.G.....
        ..G..G..GG....
        .....G...G....
        .........GG...
        ..........G...
    """,
    'astoria_meander': """
        BBBBBBBBBBBBBBB
        B.B.B.B.B.B.BBB
        B.B.BBB.B.BBBBB
        B.BBBBB.B.B.BBB
        B.BBBBB.BBB.BBB
        B.B.B.BB.B.BB.B
        BBB.B.BB.B.BBBB
        B.B.BBBB.B.B.BB
        B.B.BBBB.B.BBBB
        B.B.B.B.B.B.BBB
        BBBBBBBBBBBBBBB
    """,
    'astoria_amphora': """
        ...NNN...
        ..NNNNN..
        .NNNNNNN.
        N.NNNNN.N
        NNNNNNNNN
        NNNNNNNNN
        .NNNNNNN.
        ..NNNNN..
        ...NNN...
        ...NNN...
        ...NNN...
        ..NNNNN..
        .NNNNNNN.
        NNNNNNNNN
        NNNNNNNNN
    """,
    'astoria_spartan': """
        ....RRRR....
        ...RRRRRR...
        ..RRR..RRR..
        .RRRR..RRRR.
        KKKKKKKKKKKK
        K..K..K..KKK
        K.W.WW.W.WKK
        K..KK.KK..KK
        KKK........K
        .KKKKKKKKKK.
        ...KKKKKK...
    """,
    'astoria_owl': """
        ..NNNNNNNN..
        .NNNNNNNNNN.
        NNYYNNYYYYNN
        NYWWYNYWWYNN
        NYWKYNYWKYNN
        NNYYNNYYYYNN
        NNNNNNNNNNNN
        NNWNWNNWNWNN
        NNWNWNNWNWNN
        ..NNNNNNNN..
        ...OO..OO...
    """,
    'astoria_cross': """
        ......YY......
        ......YY......
        ....YYYYYY....
        ......YY......
        ....YYYYYY....
        ......YY......
        ......YY......
        ......YY......
        ....YYYYYY....
        ......YY......
        ......YY......
    """,
    'astoria_torch': """
        ..YYY...
        .YYYYY..
        YYYORYYY
        YYRORRYY
        YYYRYYY.
        .YYYY...
        ..YY....
        ..NN....
        ..NN....
        ..NN....
        ..NN....
        ..NN....
        .NNNN...
        NNNNNN..
    """,
    'astoria_souvlaki': """
        K..........
        KNNNN...
        K.....NNNN.
        K.NNNN.....
        K.....NNNN.
        K..NNNN....
        K..........
    """,
    'astoria_greek_flag': """
        BBBBBBBBBB
        WWWWWWWWWW
        BWWWWWWWWB
        WWWBWBWWWW
        BWBBBBBWWB
        WWWBWBWWWW
        BWWWWWWWWB
        WWWWWWWWWW
        BBBBBBBBBB
        WWWWWWWWWW
    """,
    'astoria_clapper': """
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
    'astoria_camera': """
        .KKKKKK....
        .K....K....
        KKKKKKKKKKK
        K..WW..WWWK
        K..WW..WWWK
        K..WW..WWWK
        KKKKKKKKKKK
        ..K.....K..
        ..K.....K..
        ..KKKKKKK..
    """,
    'astoria_reel': """
        .KKKKKKK.
        KKKWWWKKK
        KKWWWWWKK
        KWW.K.WWK
        KWWKKKWWK
        KWW.K.WWK
        KKWWWWWKK
        KKKWWWKKK
        .KKKKKKK.
    """,
    'astoria_alpha': """
        BB..BB
        BB.BB.
        BBBB..
        BB.BB.
        BB..BB
    """,
    'astoria_omega': """
        .WWWWW.
        WWWWWWW
        WWW.WWW
        WW...WW
        WW...WW
        W.W.W.W
        WW...WW
    """,

    # ──────────────────────────────────────────────────────────
    #  EAST VILLAGE SPECIFIC (kept from batch 2)
    # ──────────────────────────────────────────────────────────

    'ev_cbgb_marquee': """
        KKKKKKKKKKKKKKKKKKKKK
        KKKKKKKKKKKKKKKKKKKKK
        KWWKWWKKWWKKWKKKWWWKK
        KW.KWKWKW.KKWKKKW.WKK
        KW.KWKWKWKKKWKKKW.WKK
        KWWKWKWKWWWKWKKKWWWKK
        KW.KWKWKWKWKWKKKW.WKK
        KW.KWKWKW.WKWKKKW.WKK
        KWWKWWKKWWWKWWWWW.WKK
        KKKKKKKKKKKKKKKKKKKKK
        RWRWRWRWRWRWRWRWRWRWR
        WRWRWRWRWRWRWRWRWRWRW
        RWRWRWRWRWRWRWRWRWRWR
    """,
    'ev_astor_cube': """
        ..KKKKKKKKKKKKKKKK..
        .KKKKKKKKKKKKKKKKKK.
        KKKWKKKKKKKKKKKKWKK.
        KKW.KKKKKKKKKKKK.WK.
        KKKWKKKKKKKKKKKKWKK.
        KKKKKKKKKKKKKKKKKKK.
        KKKKKKKKKKKKKKKKKKK.
        KKKKKKKKKKKKKKKKKKK.
        KKKKKKKKKKKKKKKKKKK.
        KKKKKKKKKKKKKKKKKKK.
        KKKWKKKKKKKKKKKKWKK.
        KKW.KKKKKKKKKKKK.WK.
        KKKWKKKKKKKKKKKKWKK.
        .KKKKKKKKKKKKKKKKKK.
        ..KKKKKKKKKKKKKKKK..
        ......KK....KK......
        ......KK....KK......
    """,
    'ev_cooper_union': """
        ......KKKKKKKKKK......
        .....KKKKKKKKKKKK.....
        ....KKKKKKKKKKKKKK....
        ...KKKKKKKKKKKKKKKK...
        ..KKKKKKKKKKKKKKKKKK..
        NNNNNNNNNNNNNNNNNNNNNN
        NWWNWWNWWNWWNWWNWWNWWN
        NWWNWWNWWNWWNWWNWWNWWN
        NNNNNNNNNNNNNNNNNNNNNN
        NWWNWWNWWNWWNWWNWWNWWN
        NWWNWWNWWNWWNWWNWWNWWN
        NNNNNNNNNNNNNNNNNNNNNN
        NWWNWWNWWNWWNWWNWWNWWN
        NWWNWWNWWNWWNWWNWWNWWN
        NNNNNNNNNNNNNNNNNNNNNN
    """,
    'ev_punk_portrait': """
        ......KKKKK......
        .....KKKKKKK.....
        ....KKKK.KKKK....
        ....KKKKKKKKK....
        ....KKWWWWWKK....
        ...KKWKWWWWKK....
        ...KKKWWWWKKK....
        ....KKKKKKKK.....
        ....KK..KKKK.....
        ...KKKK.KKKKK....
        ..KKKKKKKKKKKK...
        .KKRKKKRRKKRKKK..
        KRKKRKKRRKKKRKKK.
    """,
    'ev_guitar': """
        ......KK..........
        ......KK..........
        ......KK..........
        ......KK..........
        ......KK..........
        ......KK..........
        ....NNNNN.........
        ...NNNNNNN........
        ..NNYNNYNNN.......
        .NNNYNYNNNN.......
        NNN.NNN.NNN.......
        NNNNNNNNNNN.......
        .NNNNNNNNN........
        ..NNNNNNN.........
        ......KK..........
        ......KK..........
        ......KKKNNNN.....
        ......KKKKNNNN....
        .......KKKKNNNN...
        ........KKKNNNNN..
        .........KKNNNNNN.
        ..........KKNNNNK.
    """,
    'ev_anarchy': """
        ....RRRRRR....
        ..RRR....RRR..
        .RR........RR.
        RR..RRRRRR..RR
        RR.RR....RR.RR
        R.RR.RRRR.RR.R
        R.RR.RRRR.RR.R
        RR.RRRRRRRR.RR
        RR..RR..RR..RR
        .RR........RR.
        ..RRR....RRR..
        ....RRRRRR....
    """,
    'ev_mohawk': """
        ....RR.......
        ...RRRR......
        ..RRRRRR.....
        .RRRRRRRRR...
        RRRRRRRRRRR..
        ..KKKKKKKKK..
        ..KK.K.KKKKK.
        ..KKKKKKKKKK.
        ..KKWWWWWWKK.
        ...KKKKKKKK..
        ....KKKKKK...
    """,
    'ev_jacket': """
        ..KKKKKKKKKK..
        .KKKKKKKKKKKK.
        KKKKKKKKKKKKKK
        KKKKWWWKWWKKKK
        KKKKWWWKWWKKKK
        KKKKKKKKKKKKKK
        KKKKKKKKKKKKKK
        KKWWKKKKKKKWWK
        KKKKKKKKKKKKKK
        KKKKKKKKKKKKKK
    """,
    'ev_pyramid': """
        .....U.....
        ....UUU....
        ...UUUUU...
        ..UUUWUUU..
        .UUUUWUUUU.
        UUUUWWWUUUU
        UUUWWWWWUUU
        UUWWWWWWWUU
        UWWWWWWWWWU
        UUUUUUUUUUU
    """,
    'ev_turntable': """
        KKKKKKKKKKKKK
        KKKKKKKKKKKKK
        KKKWWWWWWWKKK
        KKWKKKKKKKWKK
        KWKKKWWWKKKWK
        KWKKWRRRWKKWK
        KWKKKWWWKKKWK
        KKWKKKKKKKWKK
        KKKWWWWWWWKKK
        KKKKKKKKKKKKK
    """,
    'ev_skull_bandana': """
        ..WWWWWWWW..
        .WWWWWWWWWW.
        WWWWWWWWWWWW
        WKK.KKK.KKWW
        WKK.KKK.KKWW
        WWWWWWWWWWWW
        RRRRRRRRRRRR
        RWRRRRRRRRRR
        RRRRRRRRRRRR
    """,
    'ev_skull_small': """
        .KKKKKK.
        KWWWWWWK
        KW.WWW.K
        KW.K.W.K
        KWWWWWWK
        .KWWWWK.
        ..KKKK..
    """,
    'ev_cat_anarchy': """
        K..K
        KKKK
        KKWWK
        KWKWWK
        KKKWK
        .KKK.
        .KK.K
        KK.KK
    """,
    'ev_eye': """
        .UUUUU.
        UUUUUUU
        UUWWWUU
        UWBBBWU
        UUWWWUU
        UUUUUUU
        .UUUUU.
    """,
    'ev_strand': """
        RRRRRRRRR
        RYYYYYYYR
        RYRYRYRYR
        RYRRRRRYR
        RYRYRYRYR
        RYYYYYYYR
        RRRRRRRRR
    """,
    'ev_pierogi': """
        ..NNNNNN..
        .NNNNNNNN.
        NNNWWWWNNN
        NNWNWNWNNN
        NNNWWWWNNN
        .NNNNNNNN.
        ..NNNNNN..
    """,
    'ev_st_marks': """
        GGGGGGGGGG
        GWWWWWWWWG
        GWGWWGGWWG
        GWWGGGWGGG
        GWWGGGWGWG
        GWWWWWWWWG
        GGGGGGGGGG
    """,
    'ev_vinyl': """
        ..KKKKKK..
        .KKKKKKKK.
        KKKWWWWKKK
        KKWRRRWWKK
        KKKWWWWKKK
        .KKKKKKKK.
        ..KKKKKK..
    """,
    'ev_drip': """
        PPPP
        PPPP
        PPPP
        .PP.
        .PP.
        ..P.
    """,
    'ev_safety_pin': """
        WW.....WW
        WWW...WWW
        .WWWWWWW.
        ..WW.WW..
        ...WWW...
        ....W....
    """,

    # ──────────────────────────────────────────────────────────
    #  LES SPECIFIC (kept from batch 2)
    # ──────────────────────────────────────────────────────────

    'les_manhattan_bridge': """
        .......YYY..............YYY.......
        ......YYYYY............YYYYY......
        ....YYY..YYY..........YYY..YYY....
        ...YYY....YYY........YYY....YYY...
        ..YYY......YYY......YYY......YYY..
        .YYY........YYY....YYY........YYY.
        YYYY.........YYYYYYYYY.........YYYY
        YYY...........YYYYYY...........YYY
        YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY
        K.K.K.K.K.K.K.K.K.K.K.K.K.K.K.K.K.K
        BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
    """,
    'les_williamsburg_bridge': """
        .....RRRR..........RRRR.....
        ....RRRRRR........RRRRRR....
        ...RRRRRRR........RRRRRRR...
        ..RRR..RRR........RRR..RRR..
        .RRR....RRR......RRR....RRR.
        RRR......RRR....RRR......RRR
        RRR.......RRRRRRRR........RRR
        KKKKKKKKKKKKKKKKKKKKKKKKKKKKK
        KK.KK.KK.KK.KK.KK.KK.KK.KK.KK
    """,
    'les_tenement': """
        NNNNNNNNNNNNNNNNNN
        NWWNNWWNNWWNNWWNNN
        NWWNNWWNNWWNNWWNNN
        NWWNNWWNNWWNNWWNNN
        NNNNNNNNNNNNNNNNNN
        NWWNNWWNNWWNNWWNNN
        NWWNNWWNNWWNNWWNNN
        NWWNNWWNNWWNNWWNNN
        NNNNNNNNNNNNNNNNNN
        NWWNNWWNNWWNNWWNNN
        NWWNNWWNNWWNNWWNNN
        NWWNNWWNNWWNNWWNNN
        NNNNNNNNNNNNNNNNNN
    """,
    'les_streits': """
        RRRRRRRRRRRRRRRR
        RYYYYYYYYYYYYYYR
        RYRRRRRRRRRRRRYR
        RYRYYYRYYRYYYRYR
        RYRYRYRYRYRYRRYR
        RYRYYYRYRYYYYRYR
        RYRYRRRYRYRRRRYR
        RYRYRRRYRYRRRRYR
        RYRRRRRRRRRRRRYR
        RYYYYYYYYYYYYYYR
        RRRRRRRRRRRRRRRR
    """,
    'les_essex': """
        OOOOOOOOOOOOOOOOOO
        OYOYOYOYOYOYOYOYOO
        ORRRRRRRRRRRRRRRRO
        OWWWWWWWWWWWWWWWWO
        OWWWKWWWKWWWKWWWWO
        OWWKKWWKKWWKKWWWWO
        OWWWKWWWKWWWKWWWWO
        OWWWWWWWWWWWWWWWWO
        ORRRRRRRRRRRRRRRRO
        OYOYOYOYOYOYOYOYOO
        NNNNNNNNNNNNNNNNNN
        NWWNNWWNNWWNNWWNNN
        NWWNNWWNNWWNNWWNNN
    """,
    'les_bagel_lox': """
        ....NNNNNNN....
        ..NNNNNNNNNNN..
        .NNWWWWWWWNNNN.
        NNWWPPPPPWWWNNN
        NNWWPPPPPWWWNNN
        NNWWWWWWWWWNNNN
        .NNNNNNNNNNNNN.
        ..NNNNNNNNNNN..
        ....NNNNNNN....
    """,
    'les_menorah': """
        Y.Y.Y.Y.Y.Y.Y
        Y.Y.Y.Y.Y.Y.Y
        Y.Y.Y.Y.Y.Y.Y
        YYYYYYYYYYYYY
        ......Y......
        ......Y......
        ...YYYYYYY...
        ...YYYYYYY...
    """,
    'les_star_of_david': """
        ......B......
        .....BBB.....
        ....BBBBB....
        BBBBBBBBBBBBB
        .BBBBBBBBBBB.
        ..BBBBBBBBB..
        .BBBBBBBBBBB.
        BBBBBBBBBBBBB
        ....BBBBB....
        .....BBB.....
        ......B......
    """,
    'les_torah': """
        N.N.N.N.N.N.N
        N.WWWWWWWWWWN
        N.WKWKWKWKWWN
        N.WKKKKKKKKWN
        N.WKWKWKWKWWN
        N.WWWWWWWWWWN
        N.N.N.N.N.N.N
    """,
    'les_accordion': """
        KKKKKKKKKKKK
        KWWWWWWWWWWK
        KWBKBKBKBKBK
        KWBKBKBKBKBK
        KWBKBKBKBKBK
        KWBKBKBKBKBK
        KWWWWWWWWWWK
        KKKKKKKKKKKK
    """,
    'les_hassidic_hat': """
        ...KKKKKKK...
        ..KKKKKKKKK..
        .KKKKKKKKKKK.
        KKKKKKKKKKKKK
        KKKKKKKKKKKKK
        KKKKKKKKKKKKK
        KKKKKKKKKKKKK
        KKKKKKKKKKKKK
    """,
    'les_pickle_barrel': """
        NNNNNNNNNN
        NGGGGGGGGN
        NGGNGGNGGN
        NGGGGGGGGN
        NGGNGGNGGN
        NGGGGGGGGN
        NGGNGGNGGN
        NGGGGGGGGN
        NNNNNNNNNN
    """,
    'les_smoked_fish': """
        ...PPPPPPP...
        ..PPPPPPPPP..
        .PPPPPPPPPPP.
        PPPPPP.PPPPPP
        PPPPP...PPPPP
        PPPPPP.PPPPPP
        .PPPPPPPPPPP.
        ..PPPPPPPPP..
        ...PPPPPPP...
    """,
    'les_dragon': """
        .........RRR....
        ........RRRRR...
        .RR....RRROORR..
        RRRR..RRRRRRRR..
        RRRRRRRRRRRR....
        RRRRRRRR........
        ..RRRR..........
        ...RR...........
    """,
    'les_bao': """
        ..WWWWWW..
        .WWWWWWWW.
        WWWWWKWWWW
        WWKKKKKKWW
        WWWWWWWWWW
        WWWWWWWWWW
        .WWWWWWWW.
        ..NNNNNN..
    """,
    'les_knish': """
        ..OOOOOO..
        .OOOOOOOO.
        OOOOKOOOOO
        OOKKKKKOOO
        OOOOKOOOOO
        OOOOOOOOOO
        .OOOOOOOO.
        ..OOOOOO..
    """,
    'les_falafel': """
        ..WWWW....
        .WWWWWW...
        WWWGGGWW..
        WWGNGNGW..
        WWGGGGGW..
        .WWWWWW...
        ..WWWW....
    """,
    'les_egg_cream': """
        WWWWWWWW
        NNNNNNNN
        NNNNNNNN
        N..N..NN
        N..N..NN
        N..N..NN
        WWWWWWWW
    """,
    'les_donut': """
        ..PPPPPP..
        .PPPPPPPP.
        PPPP..PPPP
        PPP....PPP
        PPP....PPP
        PPPP..PPPP
        .PPPPPPPP.
        ..PPPPPP..
    """,
    'les_subway_f': """
        .OOOOO.
        OOOOOOO
        OWWWWWO
        OW...OO
        OWWWOOO
        OW...OO
        OW...OO
        OOOOOOO
        .OOOOO.
    """,
    'les_subway_b': """
        .OOOOO.
        OOOOOOO
        OWWWWOO
        OW..WOO
        OWWWWOO
        OW..WOO
        OWWWWOO
        OOOOOOO
        .OOOOO.
    """,
    'les_yarmulke': """
        ..UUUU..
        .UUUUUU.
        UUUUUUUU
        UUUUUUUU
        WWWWWWWW
    """,
    'les_theater_mask': """
        ..WWWWWW..
        .WWWWWWWW.
        WW..W..WWW
        W.K.W.K.WW
        W..WWW..WW
        W.WW.WW.WW
        WWW...WWW.
        .WWWWWWW..
    """,
    'les_pickle_small': """
        .GG..
        GGGN.
        GGNG.
        GGGG.
        GGGG.
        GGNG.
        .GG..
    """,
}


# ════════════════════════════════════════════════════════════════════════════
#  PLANS — each tuple is (sprite_name, scale).
#  Constraint: each sprite_name appears at most ONCE per neighborhood.
#  Roughly 50% of placements are 20–50 px (scale 4–5 with 5–10 char ascii).
# ════════════════════════════════════════════════════════════════════════════

# Whimsical/fun pool — split into 4 disjoint subsets so each NH gets unique fun
WHIMSICAL_LIC = [
    'smiley', 'cute_pizza', 'cute_cat', 'cute_robot', 'cute_alien',
    'mushroom', 'rainbow', 'lightbulb', 'cherry', 'pumpkin', 'soccer_ball',
    'cute_doge', 'sushi_face',
]
WHIMSICAL_ASTORIA = [
    'heart_eyes', 'cute_donut', 'cute_dog', 'cute_unicorn', 'cute_lemon',
    'disco_ball', 'watermelon', 'cute_pepe', 'penguin_cute', 'cute_ghost',
    'crying_laugh', 'rubber_duck', 'cactus',
]
WHIMSICAL_EV = [
    'cool_face', 'cute_avocado', 'cute_banana', 'cute_ufo', 'frog_cartoon',
    'octopus_cute', 'basketball', 'cupcake', 'bee_cute', 'snowman',
    'party_face',
]
WHIMSICAL_LES = [
    'cute_pizza', 'heart_eyes', 'cute_dog', 'cute_alien', 'cute_ghost',
    'rainbow', 'soccer_ball', 'lightbulb', 'cherry', 'cupcake',
    'pumpkin', 'cactus', 'crying_laugh',
]
# (a few whimsical reused across NHs is fine since each neighborhood still uses
# any given sprite ≤ 1×.)

PLAN_LIC_ART = [
    ('lic_pepsi',          7),
    ('lic_citi_field',     6),
    ('lic_queensboro',     6),
    ('lic_tram',           5),
    ('lic_moma_ps1',       5),
    ('lic_silvercup',      6),
    ('lic_water_tower',    5),
    ('lic_subway_7',       4),
    ('lic_subway_g',       4),
    ('lic_mr_met',         5),
    ('lic_mets_cap',       4),
    ('lic_taxi_front',     4),
    ('lic_taxi_side',      4),
    ('lic_pigeon',         4),
    ('lic_spiderman',      4),
    ('lic_pizza',          4),
    ('lic_lighthouse',     4),
    ('lic_warehouse',      4),
    ('lic_smokestack',     4),
    ('lic_gantry',         4),
    ('lic_crane',          4),
]

PLAN_ASTORIA_ART = [
    ('astoria_parthenon',  6),
    ('astoria_hellgate',   6),
    ('astoria_caryatid',   5),
    ('astoria_temple',     5),
    ('astoria_olive',      4),
    ('astoria_meander',    4),
    ('astoria_amphora',    4),
    ('astoria_spartan',    5),
    ('astoria_owl',        4),
    ('astoria_cross',      4),
    ('astoria_torch',      5),
    ('astoria_souvlaki',   4),
    ('astoria_greek_flag', 4),
    ('astoria_clapper',    4),
    ('astoria_camera',     4),
    ('astoria_reel',       4),
    ('astoria_alpha',      4),
    ('astoria_omega',      4),
]

PLAN_EV_ART = [
    ('ev_cbgb_marquee',    5),
    ('ev_astor_cube',      5),
    ('ev_cooper_union',    5),
    ('ev_punk_portrait',   6),
    ('ev_guitar',          5),
    ('ev_anarchy',         6),
    ('ev_mohawk',          4),
    ('ev_jacket',          4),
    ('ev_pyramid',         5),
    ('ev_turntable',       4),
    ('ev_skull_bandana',   5),
    ('ev_skull_small',     4),
    ('ev_cat_anarchy',     5),
    ('ev_eye',             5),
    ('ev_strand',          4),
    ('ev_pierogi',         4),
    ('ev_st_marks',        4),
    ('ev_vinyl',           4),
    ('ev_drip',            4),
    ('ev_safety_pin',      4),
]

PLAN_LES_ART = [
    ('les_manhattan_bridge',     6),
    ('les_williamsburg_bridge',  6),
    ('les_tenement',             5),
    ('les_streits',              5),
    ('les_essex',                5),
    ('les_bagel_lox',            5),
    ('les_menorah',              5),
    ('les_star_of_david',        5),
    ('les_torah',                5),
    ('les_accordion',            5),
    ('les_hassidic_hat',         4),
    ('les_pickle_barrel',        4),
    ('les_smoked_fish',          4),
    ('les_dragon',               5),
    ('les_bao',                  4),
    ('les_knish',                4),
    ('les_falafel',              4),
    ('les_egg_cream',            4),
    ('les_donut',                4),
    ('les_subway_f',             4),
    ('les_subway_b',             4),
    ('les_yarmulke',             4),
    ('les_theater_mask',         4),
    ('les_pickle_small',         4),
]


def make_plan(art, whimsical_pool, fun_count=15, fun_scales=(3, 4, 5)):
    """Combine neighborhood-specific art with a sample of whimsical sprites."""
    rng = random.Random(hash(tuple(art)) & 0xFFFFFFFF)
    fun_picks = rng.sample(whimsical_pool, min(fun_count, len(whimsical_pool)))
    fun_with_scale = [(name, rng.choice(fun_scales)) for name in fun_picks]
    return list(art) + fun_with_scale


PLANS = {
    'lic-b3':         make_plan(PLAN_LIC_ART,     WHIMSICAL_LIC,     fun_count=13),
    'astoria-b3':     make_plan(PLAN_ASTORIA_ART, WHIMSICAL_ASTORIA, fun_count=13),
    'eastvillage-b3': make_plan(PLAN_EV_ART,      WHIMSICAL_EV,      fun_count=11),
    'les-b3':         make_plan(PLAN_LES_ART,     WHIMSICAL_LES,     fun_count=13),
}

# NSFW pool — used citywide
NSFW_SPRITES = [
    'nsfw_finger', 'nsfw_eggplant', 'nsfw_peach', 'nsfw_wine', 'nsfw_beer',
    'nsfw_cig', 'nsfw_devil', 'nsfw_butt', 'nsfw_boobs', 'nsfw_lipkiss',
    'nsfw_69', 'nsfw_skull_xbones',
]


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


def place_neighborhood(key, cx, cy, rng, polys):
    pixels = {}
    plan = PLANS[key]
    placed = []
    BOX_HALF = 400  # 800×800 placement zone

    plan_sorted = sorted(
        plan,
        key=lambda p: -(sprite_dims(p[0], p[1])[0] * sprite_dims(p[0], p[1])[1]),
    )

    skipped = 0
    for sprite_name, scale in plan_sorted:
        w, h = sprite_dims(sprite_name, scale)
        x_lo = cx - BOX_HALF
        x_hi = max(x_lo + 1, cx + BOX_HALF - w)
        y_lo = cy - BOX_HALF
        y_hi = max(y_lo + 1, cy + BOX_HALF - h)

        success = False
        for _ in range(800):
            ox = rng.randint(x_lo, x_hi)
            oy = rng.randint(y_lo, y_hi)
            if any(box_overlap((ox, oy, w, h), b) for b in placed):
                continue
            if not sprite_on_land(ox, oy, w, h, polys):
                continue
            placed.append((ox, oy, w, h))
            stamp(pixels, ox, oy, sprite_name, scale)
            success = True
            break

        if not success:
            skipped += 1

    return pixels, skipped


def place_nsfw_citywide(rng, polys, count=80):
    """Scatter NSFW sprites at random positions on land, anywhere in NYC."""
    pixels = {}
    placed_boxes = []  # used only to avoid stacking on top of each other

    placed = 0
    attempts = 0
    while placed < count and attempts < count * 200:
        attempts += 1
        sprite_name = rng.choice(NSFW_SPRITES)
        scale = rng.choice([4, 5, 5, 6])  # mostly small-medium
        w, h = sprite_dims(sprite_name, scale)

        # Pick random world position; bias toward populated quadrants
        # (avoid extreme east where most land is unused water-adjacent)
        ox = rng.randint(2000, WORLD_WIDTH - 2000 - w)
        oy = rng.randint(2000, WORLD_HEIGHT - 2000 - h)

        if not sprite_on_land(ox, oy, w, h, polys):
            continue
        # Avoid stacking too close to another nsfw sprite
        if any(box_overlap((ox - 20, oy - 20, w + 40, h + 40), b) for b in placed_boxes):
            continue

        placed_boxes.append((ox, oy, w, h))
        stamp(pixels, ox, oy, sprite_name, scale)
        placed += 1

    return pixels, placed


# ── output / insertion ────────────────────────────────────────────────────────

def write_sql_file(key, rows, out_dir):
    out_path = out_dir / f'demo_seed_{key}.sql'
    BATCH = 1000
    with out_path.open('w') as f:
        f.write(f'-- Batch 3 seed: {key} ({len(rows):,} rows)\n')
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
    return out_path


def supabase_client():
    from supabase import create_client
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / '.env.local')
    url = os.environ.get('VITE_SUPABASE_URL')
    key = os.environ.get('VITE_SUPABASE_ANON_KEY')
    if not url or not key:
        raise RuntimeError('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local')
    return create_client(url, key)


def wipe_old(sb):
    try:
        resp = sb.table('pixel_events').delete().in_('session_id', OLD_SESSIONS_TO_WIPE).execute()
        return (len(resp.data) if resp.data else None, None)
    except Exception as e:
        return (None, str(e))


def insert_rows(sb, rows, label):
    CHUNK = 500
    total = len(rows)
    inserted = 0
    for start in range(0, total, CHUNK):
        chunk = rows[start:start + CHUNK]
        payload = [
            {'x': x, 'y': y, 'color': color, 'session_id': sid, 'input_mode': 't'}
            for (x, y, color, sid) in chunk
        ]
        sb.table('pixel_events').insert(payload).execute()
        inserted += len(chunk)
        pct = inserted / total * 100
        print(f'    {label}: {inserted:,}/{total:,} ({pct:.1f}%)', end='\r')
    print()


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--insert', action='store_true', help='wipe old + direct insert')
    parser.add_argument('--nsfw-count', type=int, default=80,
                        help='number of citywide NSFW placements (default 80)')
    args = parser.parse_args()

    print('Loading NYC borough polygons…')
    polys = load_borough_polygons_world()
    print(f'  → {len(polys)} rings (boroughs combined)')

    rng = random.Random(13)
    out_dir = Path(__file__).parent
    grand_total = 0
    all_rows_by_key = {}

    print()
    print('Generating per-neighborhood sprites…')
    for key, (lat, lng) in NEIGHBORHOODS.items():
        cx, cy = lat_lng_to_world(lat, lng)
        pixels, skipped = place_neighborhood(key, cx, cy, rng, polys)
        rows = [
            (x, y, color, f'demo-{key}')
            for (x, y), color in pixels.items()
            if 0 <= x < WORLD_WIDTH and 0 <= y < WORLD_HEIGHT
        ]
        all_rows_by_key[key] = rows
        grand_total += len(rows)
        sprite_counts = Counter(name for name, _ in PLANS[key])
        unique = len(sprite_counts)
        max_uses = max(sprite_counts.values())
        small = sum(1 for name, sc in PLANS[key]
                    if sprite_dims(name, sc)[0] <= 50 and sprite_dims(name, sc)[1] <= 50)
        small_pct = small / len(PLANS[key]) * 100
        out_path = write_sql_file(key, rows, out_dir)
        print(f'  {key}: {len(rows):,} px  '
              f'({unique} unique, max {max_uses}× each, {len(PLANS[key])} placements, '
              f'{small_pct:.0f}% small, {skipped} skipped over-water)  '
              f'→ {out_path.name}')

    print()
    print(f'Generating citywide NSFW (target {args.nsfw_count} placements)…')
    nsfw_pixels, nsfw_placed = place_nsfw_citywide(rng, polys, count=args.nsfw_count)
    nsfw_rows = [
        (x, y, color, 'demo-nsfw-b3')
        for (x, y), color in nsfw_pixels.items()
        if 0 <= x < WORLD_WIDTH and 0 <= y < WORLD_HEIGHT
    ]
    all_rows_by_key['nsfw-b3'] = nsfw_rows
    grand_total += len(nsfw_rows)
    nsfw_path = write_sql_file('nsfw-b3', nsfw_rows, out_dir)
    print(f'  nsfw-b3: {len(nsfw_rows):,} px ({nsfw_placed} sprites placed)  → {nsfw_path.name}')

    print()
    print(f'  ─────────────────────────────────────────────')
    print(f'  total: {grand_total:,} pixels')

    if not args.insert:
        print()
        print('SQL files written. To insert directly, re-run with --insert')
        return

    print()
    print('═══ INSERT MODE ═══')
    sb = supabase_client()

    print('Wiping old batch rows…')
    deleted, err = wipe_old(sb)
    if err:
        print(f'  ⚠ DELETE failed: {err}')
    else:
        n = deleted if deleted is not None else 'unknown number of'
        print(f'  ✓ Deleted {n} old rows')

    print('Inserting new rows…')
    for key, rows in all_rows_by_key.items():
        if rows:
            insert_rows(sb, rows, key)

    print()
    print(f'✓ Done — {grand_total:,} pixels inserted total.')


if __name__ == '__main__':
    main()
