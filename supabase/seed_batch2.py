#!/usr/bin/env python3
"""
Batch 2 seed: ~120 unique sprites, neighborhood-distinct cultural art.

Vs. batch 1:
- 30+ unique sprites per neighborhood (was ~13)
- Max 2 placements per sprite per neighborhood (was 3+)
- Almost no shared art across neighborhoods (was 50% shared)
- Scale range 2–10 (was 4–6) — XS to XL
- Direct Supabase insertion via supabase-py

Run:
  python3 supabase/seed_batch2.py            # generates SQL files only
  python3 supabase/seed_batch2.py --insert   # wipes old & inserts directly
"""
import argparse
import os
import random
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

NEIGHBORHOODS = {
    'lic-b2':         (40.7440, -73.9485),
    'astoria-b2':     (40.7721, -73.9302),
    'eastvillage-b2': (40.7265, -73.9815),
    'les-b2':         (40.7157, -73.9861),
}

OLD_SESSIONS_TO_WIPE = [
    'demo-lic', 'demo-astoria_b1', 'demo-eastvillage_b1', 'demo-les',
    'demo-lic-b2', 'demo-astoria-b2', 'demo-eastvillage-b2', 'demo-les-b2',
]

def lat_lng_to_world(lat, lng):
    x = round(((lng - NYC_SW[1]) / LNG_SPAN) * WORLD_WIDTH)
    y = round(((lat - NYC_SW[0]) / LAT_SPAN) * WORLD_HEIGHT)
    return x, y


# ════════════════════════════════════════════════════════════════════════════
#  SPRITE LIBRARY — ~120 unique designs, organized by neighborhood
# ════════════════════════════════════════════════════════════════════════════

SPRITES = {

    # ──────────────────────────────────────────────────────────
    # UNIVERSAL FILLERS — used sparingly across neighborhoods
    # ──────────────────────────────────────────────────────────

    'tiny_flower': """
        .Y.
        YPY
        .Y.
    """,
    'tiny_flower2': """
        .R.
        RYR
        .R.
    """,
    'tiny_star': """
        .Y.
        YYY
        Y.Y
    """,
    'tiny_dot': """
        BB
        BB
    """,
    'tiny_diamond': """
        .O.
        OOO
        .O.
    """,
    'tiny_plus': """
        .R.
        RRR
        .R.
    """,

    # ══════════════════════════════════════════════════════════
    # LONG ISLAND CITY  — industrial waterfront, Mets, Queens
    # ══════════════════════════════════════════════════════════

    # XL — Pepsi Cola sign (iconic LIC waterfront landmark, red/blue cursive bottle cap)
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

    # XL — Citi Field stadium silhouette (Mets home)
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

    # XL — Queensboro Bridge cantilever (more detailed)
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
        BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
        BWBBWBBWBBWBBWBBWBBWBBWBBWBBWBBB
    """,

    # XL — Roosevelt Island tram cabin (red gondola)
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

    # XL — MoMA PS1 modernist building (cube w/ courtyard)
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

    # Large — Silvercup Studios neon sign (red/yellow)
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

    # Medium — Gantry crane silhouette (LIC waterfront)
    'lic_gantry': """
        KKKKKKKKKKKK.
        K..........K.
        K..........K.
        KKKKKKKKKKKK.
        ......KK.....
        ......KK.....
        ......KK.....
        ......KK.....
        ......KK.....
        ......KK.....
        ....KKKKKK...
    """,

    # Medium — NYC water tower (LIC variant: silver tank)
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

    # Medium — Industrial smokestack (brick + smoke)
    'lic_smokestack': """
        ..WWW...
        .WWWWW..
        WWWWWWW.
        .WWWWW..
        ..WWW...
        ..NNN...
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

    # Medium — Brick warehouse
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

    # Small — "7" subway sign (purple circle)
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

    # Small — "G" subway sign (green circle)
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

    # Medium — East River ferry
    'lic_ferry': """
        ........K........
        ........K........
        .....WWWWWWW.....
        .....WWWWWWW.....
        WWWWWWWWWWWWWWWWW
        WBBWBBBBBBBBBBWWW
        WBBWBBWBBWBBWBBWW
        BBBBBBBBBBBBBBBBB
        .BBBBBBBBBBBBBBB.
        ..BBBBBBBBBBBBB..
    """,

    # Small — Yellow construction crane
    'lic_crane': """
        YYYYYYYYYYY
        Y.........Y
        YYYYYYYYYYY
        ....Y......
        ....Y......
        ....Y......
        ....Y......
        ....Y......
        ....Y......
        ...YYY.....
        ..YYYYY....
    """,

    # Medium — Loft window grid
    'lic_loft_windows': """
        KKKKKKKKKKK
        KYYKYYKYYKK
        KYYKYYKYYKK
        KYYKYYKYYKK
        KKKKKKKKKKK
        KYYKYYKYYKK
        KYYKYYKYYKK
        KYYKYYKYYKK
        KKKKKKKKKKK
    """,

    # Medium — Mr. Met (smiley head with cap)
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

    # Small — Mets cap (blue+orange NY)
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

    # Small — Yellow taxi (front view)
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

    # Small — Yellow taxi (side view)
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

    # Small — Pigeon perched (purple/white)
    'lic_pigeon_perched': """
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

    # Medium — Spider-Man (Queens hero)
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

    # Small — Pizza slice (more detail)
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

    # Small — NYC manhole cover
    'lic_manhole': """
        ..KKKKKK..
        .KKKKKKKK.
        KKKKKKKKKK
        KKWWKKWWKK
        KKKKKKKKKK
        KKKKKKKKKK
        KKWWKKWWKK
        KKKKKKKKKK
        .KKKKKKKK.
        ..KKKKKK..
    """,

    # Small — Fire hydrant (LIC red)
    'lic_hydrant': """
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

    # Small — Subway turnstile
    'lic_turnstile': """
        KKKKKKKKK
        KYYYYYYYK
        KKKKKKKKK
        KK.....KK
        KK.....KK
        KK.....KK
        KK.....KK
        KKKKKKKKK
    """,

    # XS — coffee cup
    'lic_coffee': """
        .K.K.K..
        .K.K.K..
        NNNNNNNN
        WNNNNNNW
        WNNNNNNW
        WNNNNNNW
        WWNNNNWW
        .KKKKK..
    """,

    # XS — NYC street sign post
    'lic_street_sign': """
        GGGGGG
        GWWWWG
        GWWWWG
        GGGGGG
        ..K...
        ..K...
        ..K...
        ..K...
        ..K...
    """,

    # Small — Hunters Point lighthouse
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

    # Small — Bagel cart umbrella
    'lic_cart': """
        ...YYYYY...
        ..YYYYYYY..
        .YKYYYKYYK.
        ....K......
        NNNNNNNNNNN
        N.WWNWWNN.N
        NNNNNNNNNNN
        K.K.....K.K
    """,

    # Small — UN flag (LIC near UN)
    'lic_un_flag': """
        BBBBBBBBBB
        BWWWWWWWWB
        BWBBWWBBWB
        BWBWBWBWBB
        BWWWBBWWWB
        BWBWBWBWBB
        BWBBWWBBWB
        BWWWWWWWWB
        BBBBBBBBBB
    """,

    # ══════════════════════════════════════════════════════════
    # ASTORIA  — Greek heritage, film studios, Hellgate
    # ══════════════════════════════════════════════════════════

    # XL — Acropolis Parthenon silhouette
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
        NNNNNNNNNNNNNNNNNNNNNNNN
    """,

    # XL — Hellgate Bridge truss arch
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

    # XL — Caryatid pillar (woman statue column)
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

    # XL — Astoria Park outdoor pool
    'astoria_pool': """
        NNNNNNNNNNNNNNNNNNNNN
        NBBBBBBBBBBBBBBBBBBBN
        NBWWWWWWWWWWWWWWWWWBN
        NBWBBBBBBBBBBBBBBBWBN
        NBBBBBBBBBBBBBBBBBBBN
        NBWBBBWBBBWBBBWBBBWBN
        NBBBBBBBBBBBBBBBBBBBN
        NBWBBBWBBBWBBBWBBBWBN
        NBBBBBBBBBBBBBBBBBBBN
        NBWWWWWWWWWWWWWWWWWBN
        NBBBBBBBBBBBBBBBBBBBN
        NNNNNNNNNNNNNNNNNNNNN
    """,

    # Large — Greek temple with pediment
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

    # Medium — Olive branch
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

    # Medium — Greek key meander pattern
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

    # Medium — Greek vase amphora
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

    # Medium — Spartan helmet
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

    # Medium — Steinway piano (silhouette)
    'astoria_piano': """
        KKKKKKKKKKKKK
        KKKKKKKKKKKKK
        KKKKKKKKKKKKK
        KWKKWWKKWWKKW
        KWKKWWKKWWKKW
        KWKKWWKKWWKKW
        KKKKKKKKKKKKK
    """,

    # Medium — Bohemian Hall beer stein
    'astoria_stein': """
        WWWWWWWWWWW
        WYYYYYYYYYW
        WYYYYYYYYYW
        WYYYYYYYYYW
        WYYYYYYYYYW
        WYYYYYYYYYW
        WYYYYYYYYYW
        KKKKKKKKKKK
        KKKKKKKKKKK
    """,

    # Medium — Athenian owl (Athena's symbol)
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

    # Medium — Greek Orthodox Byzantine cross
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

    # Medium — Olympic torch
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

    # Small — Spanakopita triangle
    'astoria_spanakopita': """
        ......G.....
        .....GGN....
        ....GGNNG...
        ...GNGNGG...
        ..GNGNGGGG..
        .GNGNGGGGGG.
        NNNNNNNNNNNN
    """,

    # Small — Souvlaki skewer
    'astoria_souvlaki': """
        K..........
        KNNNN...
        K.....NNNN.
        K.NNNN.....
        K.....NNNN.
        K..NNNN....
        K..........
    """,

    # Small — Loukoumades plate (donut holes)
    'astoria_loukoumades': """
        ...NNN.NNN...
        ..NNNNNNNNN..
        ..NNNNNNNNN..
        ...NNN.NNN...
        WWWWWWWWWWWW.
        .WWWWWWWWWW..
    """,

    # Small — Greek flag
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

    # Small — Brazilian flag (Astoria's diverse)
    'astoria_brazil_flag': """
        GGGGGGGGGG
        G.YYYYYY.G
        GYYBBBBYYG
        GYBBBBBBBG
        GYBWWWWBBG
        GYBBBBBBBG
        GYYBBBBYYG
        G.YYYYYY.G
        GGGGGGGGGG
    """,

    # Small — Egyptian crescent (Steinway has Arab community)
    'astoria_crescent': """
        ...GGGG..
        ..GGGGGG.
        .GG..GGG.
        GG....GG.
        GG....GG.
        .GG..GGG.
        ..GGGGGG.
        ...GGGG..
    """,

    # Small — Film clapperboard
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

    # Small — Movie camera
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

    # Small — Film reel
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

    # Small — Discus thrower silhouette
    'astoria_discus': """
        ...WWW.....
        ..WWWWW....
        WWWWWWWW..K
        WWWWWWWWKKK
        ..WWWWWW...
        ...WWWW....
        ..WWW.WW...
        .WW....WW..
        WW......W..
    """,

    # Small — Hercules club
    'astoria_club': """
        NNNN..
        NNNNN.
        NNNNNN
        NNNNNN
        NNNNN.
        .NNN..
        .NN...
        .NN...
        .NN...
        .NN...
        NNNN..
    """,

    # Small — Pegasus (winged horse)
    'astoria_pegasus': """
        ..WWWWWW....
        .WWWWWWWWW..
        WWWWWWWKWWWW
        WW.WWWWWWWWW
        .WWWWWWWWWW.
        ..WW.WWWWW..
        ..W..W.W.W..
    """,

    # XS — Greek alpha letter
    'astoria_alpha': """
        BB..BB
        BB.BB.
        BBBB..
        BB.BB.
        BB..BB
    """,

    # XS — Greek omega letter
    'astoria_omega': """
        .WWWWW.
        WWWWWWW
        WWW.WWW
        WW...WW
        WW...WW
        W.W.W.W
        WW...WW
    """,

    # XS — small olive
    'astoria_olive_small': """
        .GGG.
        GGNGG
        GGGGG
        GGGGG
        .GGG.
    """,

    # ══════════════════════════════════════════════════════════
    # EAST VILLAGE  — punk/rock culture, Tompkins, Cooper Union
    # ══════════════════════════════════════════════════════════

    # XL — CBGB-style marquee awning (red+white stripes + black sign)
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

    # XL — Astor Place black cube sculpture
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

    # XL — Cooper Union foundation building
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

    # XL — Punk portrait silhouette (Joe Strummer-ish)
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

    # XL — Electric guitar (full body)
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

    # Large — Anarchy circle-A
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

    # Medium — Tompkins Square fountain
    'ev_fountain': """
        ....BBB....
        ...BBBBB...
        ..BBKBKBB..
        ..BKBBBKB..
        ...BKBKB...
        ....BBB....
        ...NNNNN...
        ..NNNNNNN..
        .NNNNNNNNN.
        NNNNNNNNNNN
    """,

    # Medium — Mohawk haircut silhouette
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

    # Medium — Leather jacket silhouette
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

    # Medium — Spike collar
    'ev_collar': """
        K.K.K.K.K.K.K
        KKKKKKKKKKKKK
        KOWOWOWOWOWOK
        KOOOOOOOOOOOK
        KKKKKKKKKKKKK
        K.K.K.K.K.K.K
    """,

    # Medium — Iron fire escape
    'ev_fire_escape': """
        KKKKKKKKKKKK
        KKKKKKKKKKKK
        K.K.K.K.K.KK
        K.K.K.K.K.KK
        KKKKKKKKKKKK
        K.K.K.K.K.KK
        K.K.K.K.K.KK
        KKKKKKKKKKKK
        K.K.K.K.K.KK
        K.K.K.K.K.KK
        KKKKKKKKKKKK
    """,

    # Medium — NYU torch
    'ev_nyu_torch': """
        ...UU....
        ..UUUU...
        ..UUUU...
        ..UWWU...
        ..U..U...
        ..NNNN...
        ..N..N...
        ..NNNN...
        ..NNNN...
        ..NNNN...
        .NNNNNN..
        NNNNNNNN.
    """,

    # Medium — Pyramid Club triangle
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

    # Medium — Vinyl record turntable
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

    # Medium — Skull with bandana
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

    # Small — punk skull
    'ev_skull_small': """
        .KKKKKK.
        KWWWWWWK
        KW.WWW.K
        KW.K.W.K
        KWWWWWWK
        .KWWWWK.
        ..KKKK..
    """,

    # Small — Black cat (anarchist symbol)
    'ev_cat': """
        K..K
        KKKK
        KKWWK
        KWKWWK
        KKKWK
        .KKK.
        .KK.K
        KK.KK
    """,

    # Small — Tarot eye / mystic eye
    'ev_eye': """
        .UUUUU.
        UUUUUUU
        UUWWWUU
        UWBBBWU
        UUWWWUU
        UUUUUUU
        .UUUUU.
    """,

    # Small — Tattoo gun
    'ev_tattoo_gun': """
        ..KK....
        .KKKK...
        KKWWKK..
        KKKKKKK.
        ..KK..K.
        ..KK....
        ..KK....
        ..KK....
        ...K....
    """,

    # Small — Heart with banner tattoo
    'ev_heart_banner': """
        .RR.RR.
        RRRRRRR
        RRRRRRR
        .RRRRR.
        ..RRR..
        WWWWWWW
        WKKKKKW
        WWWWWWW
    """,

    # Small — Strand bookstore (red sign)
    'ev_strand': """
        RRRRRRRRR
        RYYYYYYYR
        RYRYRYRYR
        RYRRRRRYR
        RYRYRYRYR
        RYYYYYYYR
        RRRRRRRRR
    """,

    # Small — Veselka pierogi
    'ev_pierogi': """
        ..NNNNNN..
        .NNNNNNNN.
        NNNWWWWNNN
        NNWNWNWNNN
        NNNWWWWNNN
        .NNNNNNNN.
        ..NNNNNN..
    """,

    # Small — St Marks Place sign
    'ev_st_marks': """
        GGGGGGGGGG
        GWWWWWWWWG
        GWGWWGGWWG
        GWWGGGWGGG
        GWWGGGWGWG
        GWWWWWWWWG
        GGGGGGGGGG
    """,

    # Small — Hare Krishna tree (East Village landmark)
    'ev_tree': """
        ..GGGGG..
        .GGGGGGG.
        GGGGYGGGG
        GGYGGGYGG
        GGGGGGGGG
        .GGGGGGG.
        ..NNNNN..
        ..NNNNN..
        ..NNNNN..
    """,

    # Small — Cassette tape
    'ev_cassette': """
        KKKKKKKKKK
        KKKKKKKKKK
        KW.KKKK.WK
        KK..KK..KK
        KW.KKKK.WK
        KKKKKKKKKK
    """,

    # Small — Vinyl record
    'ev_vinyl': """
        ..KKKKKK..
        .KKKKKKKK.
        KKKWWWWKKK
        KKWRRRWWKK
        KKKWWWWKKK
        .KKKKKKKK.
        ..KKKKKK..
    """,

    # XS — Spray drip tag
    'ev_drip': """
        PPPP
        PPPP
        PPPP
        .PP.
        .PP.
        ..P.
    """,

    # XS — Dripping crown (Basquiat)
    'ev_crown_drip': """
        Y...YY...Y
        YY.YYYY.YY
        YYYYYYYYYY
        Y.Y.Y.Y.Y.
    """,

    # XS — Safety pin
    'ev_safety_pin': """
        WW.....WW
        WWW...WWW
        .WWWWWWW.
        ..WW.WW..
        ...WWW...
        ....W....
    """,

    # XS — Coffee espresso
    'ev_espresso': """
        WWWWWW
        WNNNNW
        WNNNNW
        WNNNNW
        WWWWWW
        K....K
    """,

    # ══════════════════════════════════════════════════════════
    # LOWER EAST SIDE  — Jewish heritage, immigrant food, bridges
    # ══════════════════════════════════════════════════════════

    # XL — Manhattan Bridge silhouette
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

    # XL — Williamsburg Bridge silhouette
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

    # XL — Tenement Museum facade
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
        NWWNNWWNNWWNNWWNNN
        NWWNNWWNNWWNNWWNNN
        NWWNNWWNNWWNNWWNNN
        NNNNNNNNNNNNNNNNNN
    """,

    # XL — Streit's Matzo factory sign
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
        RYRYRYRYRYRYRYRY
        RRRRRRRRRRRRRRRR
    """,

    # XL — Essex Market awning
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

    # Large — Bagel with lox + schmear
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

    # Medium — 7-branched menorah
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

    # Medium — Star of David
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

    # Medium — Torah scroll
    'les_torah': """
        N.N.N.N.N.N.N
        N.WWWWWWWWWWN
        N.WKWKWKWKWWN
        N.WKKKKKKKKWN
        N.WKWKWKWKWWN
        N.WWWWWWWWWWN
        N.N.N.N.N.N.N
    """,

    # Medium — Klezmer accordion
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

    # Medium — Hassidic hat
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

    # Medium — Pickle barrel
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

    # Medium — Russ & Daughters smoked-fish display
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

    # Medium — Chinese dragon (Chinatown adjacent)
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

    # Medium — Dim sum bao bun
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

    # Small — Knish
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

    # Small — Falafel wrap
    'les_falafel': """
        ..WWWW....
        .WWWWWW...
        WWWGGGWW..
        WWGNGNGW..
        WWGGGGGW..
        .WWWWWW...
        ..WWWW....
    """,

    # Small — Egg cream soda glass
    'les_egg_cream': """
        WWWWWWWW
        NNNNNNNN
        NNNNNNNN
        N..N..NN
        N..N..NN
        N..N..NN
        WWWWWWWW
    """,

    # Small — Doughnut Plant donut
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

    # Small — Lox knife
    'les_lox_knife': """
        WWWWWWWWWWWW
        WKKKKKKKKKKW
        WWWWWWWWWWWW
        ..NNNNN.....
        ..NNNNN.....
    """,

    # Small — Schmear container (cream cheese)
    'les_schmear': """
        WWWWWWW
        WBBBBBW
        WBWBWBW
        WBBBBBW
        WBWBWBW
        WBBBBBW
        WWWWWWW
    """,

    # Small — "F" subway sign
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

    # Small — "B" subway sign
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

    # Small — Yarmulke (kippah)
    'les_yarmulke': """
        ..UUUU..
        .UUUUUU.
        UUUUUUUU
        UUUUUUUU
        WWWWWWWW
    """,

    # Small — Yiddish theater mask
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

    # XS — Pickle
    'les_pickle_small': """
        .GG..
        GGGN.
        GGNG.
        GGGG.
        GGGG.
        GGNG.
        .GG..
    """,

    # XS — Kippah dot
    'les_kippah_dot': """
        .UU.
        UUUU
        UUUU
        WWWW
    """,
}


# ════════════════════════════════════════════════════════════════════════════
#  PER-NEIGHBORHOOD PLANS
#  Format: (sprite_name, scale)
#  Constraint: each sprite_name appears at most 2 times per neighborhood.
# ════════════════════════════════════════════════════════════════════════════

PLAN_LIC = [
    # XL — statement pieces
    ('lic_pepsi',        9),  ('lic_pepsi',        7),
    ('lic_citi_field',   8),
    ('lic_queensboro',   7),  ('lic_queensboro',   5),
    ('lic_tram',         6),
    ('lic_moma_ps1',     6),
    # Large
    ('lic_silvercup',    7),
    ('lic_warehouse',    6),  ('lic_warehouse',    4),
    ('lic_smokestack',   6),
    ('lic_water_tower',  7),  ('lic_water_tower',  5),
    ('lic_loft_windows', 6),
    ('lic_mr_met',       6),
    ('lic_ferry',        5),
    # Medium
    ('lic_gantry',       6),
    ('lic_crane',        5),
    ('lic_subway_7',     6),  ('lic_subway_7',     4),
    ('lic_subway_g',     6),  ('lic_subway_g',     4),
    ('lic_lighthouse',   5),
    ('lic_un_flag',      4),
    # Small
    ('lic_mets_cap',     5),  ('lic_mets_cap',     4),
    ('lic_taxi_front',   5),
    ('lic_taxi_side',    5),
    ('lic_pigeon_perched', 5),
    ('lic_spiderman',    5),
    ('lic_pizza',        5),
    ('lic_manhole',      5),
    ('lic_hydrant',      5),
    ('lic_turnstile',    4),
    ('lic_cart',         5),
    # XS
    ('lic_coffee',       3),  ('lic_coffee',       4),
    ('lic_street_sign',  3),
    ('tiny_star',        4),
    ('tiny_flower',      3),
]

PLAN_ASTORIA = [
    # XL
    ('astoria_parthenon', 7),
    ('astoria_hellgate',  7),
    ('astoria_caryatid',  7), ('astoria_caryatid',  5),
    ('astoria_pool',      6),
    ('astoria_temple',    6), ('astoria_temple',    5),
    # Large/Medium
    ('astoria_olive',     6), ('astoria_olive',     4),
    ('astoria_meander',   5),
    ('astoria_amphora',   5), ('astoria_amphora',   4),
    ('astoria_spartan',   6),
    ('astoria_piano',     6),
    ('astoria_stein',     6),
    ('astoria_owl',       5),
    ('astoria_cross',     5), ('astoria_cross',     4),
    ('astoria_torch',     5),
    # Small
    ('astoria_spanakopita', 5),
    ('astoria_souvlaki',    5),
    ('astoria_loukoumades', 5),
    ('astoria_greek_flag',  6), ('astoria_greek_flag', 4),
    ('astoria_brazil_flag', 5),
    ('astoria_crescent',    5),
    ('astoria_clapper',     5),
    ('astoria_camera',      5),
    ('astoria_reel',        5),
    ('astoria_discus',      5),
    ('astoria_club',        5),
    ('astoria_pegasus',     4),
    # XS
    ('astoria_alpha',       5), ('astoria_alpha',     3),
    ('astoria_omega',       5),
    ('astoria_olive_small', 4),
    ('tiny_flower',         3),
]

PLAN_EV = [
    # XL
    ('ev_cbgb_marquee',  6),
    ('ev_astor_cube',    6),
    ('ev_cooper_union',  6),
    ('ev_punk_portrait', 7),
    ('ev_guitar',        6), ('ev_guitar',        4),
    # Large/Medium
    ('ev_anarchy',       7), ('ev_anarchy',       5),
    ('ev_fountain',      6),
    ('ev_mohawk',        5),
    ('ev_jacket',        5),
    ('ev_collar',        5),
    ('ev_fire_escape',   5), ('ev_fire_escape',   4),
    ('ev_nyu_torch',     6),
    ('ev_pyramid',       6),
    ('ev_turntable',     5),
    ('ev_skull_bandana', 6),
    # Small
    ('ev_skull_small',   5),
    ('ev_cat',           6),
    ('ev_eye',           5),
    ('ev_tattoo_gun',    5),
    ('ev_heart_banner',  5),
    ('ev_strand',        5),
    ('ev_pierogi',       5), ('ev_pierogi',       4),
    ('ev_st_marks',      5),
    ('ev_tree',          5),
    ('ev_cassette',      5),
    ('ev_vinyl',         5),
    # XS
    ('ev_drip',          4), ('ev_drip',          3),
    ('ev_crown_drip',    4),
    ('ev_safety_pin',    4),
    ('ev_espresso',      4),
    ('tiny_dot',         3),
]

PLAN_LES = [
    # XL
    ('les_manhattan_bridge',  6),
    ('les_williamsburg_bridge', 7),
    ('les_tenement',          5),
    ('les_streits',           6),
    ('les_essex',             6),
    # Large
    ('les_bagel_lox',         6), ('les_bagel_lox', 4),
    # Medium
    ('les_menorah',           6),  ('les_menorah', 4),
    ('les_star_of_david',     6),  ('les_star_of_david', 4),
    ('les_torah',             6),
    ('les_accordion',         6),
    ('les_hassidic_hat',      5),
    ('les_pickle_barrel',     5),
    ('les_smoked_fish',       5),
    ('les_dragon',            5),
    ('les_bao',               5),
    # Small
    ('les_knish',             5),  ('les_knish', 4),
    ('les_falafel',           5),
    ('les_egg_cream',         5),
    ('les_donut',             5),
    ('les_lox_knife',         5),
    ('les_schmear',           5),
    ('les_subway_f',          5),
    ('les_subway_b',          5),
    ('les_yarmulke',          5),
    ('les_theater_mask',      5),
    # XS
    ('les_pickle_small',      4),
    ('les_kippah_dot',        4),
    ('tiny_flower2',          3),
    ('tiny_star',             3),
    ('tiny_diamond',          3),
]

PLANS = {
    'lic-b2':         PLAN_LIC,
    'astoria-b2':     PLAN_ASTORIA,
    'eastvillage-b2': PLAN_EV,
    'les-b2':         PLAN_LES,
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
    BOX_HALF = 400  # 800×800 px fill zone

    # Sort plan by sprite size descending so big pieces get placed first
    plan_sorted = sorted(
        plan,
        key=lambda p: -(sprite_dims(p[0], p[1])[0] * sprite_dims(p[0], p[1])[1]),
    )

    for sprite_name, scale in plan_sorted:
        w, h = sprite_dims(sprite_name, scale)
        x_lo = cx - BOX_HALF
        x_hi = max(x_lo + 1, cx + BOX_HALF - w)
        y_lo = cy - BOX_HALF
        y_hi = max(y_lo + 1, cy + BOX_HALF - h)

        success = False
        for _ in range(500):
            ox = rng.randint(x_lo, x_hi)
            oy = rng.randint(y_lo, y_hi)
            if not any(box_overlap((ox, oy, w, h), b) for b in placed):
                placed.append((ox, oy, w, h))
                stamp(pixels, ox, oy, sprite_name, scale)
                success = True
                break

        if not success:
            ox = rng.randint(x_lo, x_hi)
            oy = rng.randint(y_lo, y_hi)
            placed.append((ox, oy, w, h))
            stamp(pixels, ox, oy, sprite_name, scale)

    return pixels


# ── SQL output (kept for backup/review) ───────────────────────────────────────

def write_sql_file(key, rows, out_dir):
    out_path = out_dir / f'demo_seed_{key}.sql'
    BATCH = 1000
    with out_path.open('w') as f:
        f.write(f'-- Batch 2 seed: {key} ({len(rows):,} rows)\n')
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


# ── direct insertion ─────────────────────────────────────────────────────────

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
    """Delete all rows tagged with the old/previous batch session ids.
    Returns (deleted_count_or_None, error_or_None)."""
    try:
        # Supabase REST DELETE requires a filter; use in_() with the explicit list.
        resp = sb.table('pixel_events').delete().in_('session_id', OLD_SESSIONS_TO_WIPE).execute()
        return (len(resp.data) if resp.data else None, None)
    except Exception as e:
        return (None, str(e))


def insert_rows(sb, rows, label):
    """Insert rows in chunks of 500."""
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
    parser.add_argument('--insert', action='store_true',
                        help='Wipe old + insert new directly via supabase-py (requires .env.local)')
    args = parser.parse_args()

    rng = random.Random(11)
    out_dir = Path(__file__).parent
    grand_total = 0
    all_rows_by_key = {}
    diversity_report = {}

    print('Generating sprites…')
    for key, (lat, lng) in NEIGHBORHOODS.items():
        cx, cy = lat_lng_to_world(lat, lng)
        pixels = place_neighborhood(key, cx, cy, rng)
        rows = [
            (x, y, color, f'demo-{key}')
            for (x, y), color in pixels.items()
            if 0 <= x < WORLD_WIDTH and 0 <= y < WORLD_HEIGHT
        ]
        all_rows_by_key[key] = rows
        grand_total += len(rows)
        sprite_counts = Counter(name for name, _ in PLANS[key])
        unique_sprites = len(sprite_counts)
        max_uses = max(sprite_counts.values())
        diversity_report[key] = (unique_sprites, max_uses, len(PLANS[key]))

        out_path = write_sql_file(key, rows, out_dir)
        print(f'  {key}: {len(rows):,} px  '
              f'({unique_sprites} unique sprites, max {max_uses}× each, {len(PLANS[key])} placements)  '
              f'→ {out_path.name}')

    print(f'  ─────────────────────────────────────────────')
    print(f'  total: {grand_total:,} pixels across {len(NEIGHBORHOODS)} neighborhoods')
    print()
    print('Diversity check (sprite_name → uses per neighborhood):')
    for key, (unique, max_uses, total) in diversity_report.items():
        status = '✓' if max_uses <= 2 else '✗'
        print(f'  {status} {key}: {unique} unique types, max {max_uses} uses (target ≤2)')

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
        print(f'  Continuing with insert; old rows may remain.')
        print(f'  To clean up manually, run in Supabase SQL editor:')
        print(f"    DELETE FROM pixel_events WHERE session_id IN ({','.join(repr(s) for s in OLD_SESSIONS_TO_WIPE)});")
    else:
        n = deleted if deleted is not None else 'unknown number of'
        print(f'  ✓ Deleted {n} old rows')

    print('Inserting new rows…')
    for key, rows in all_rows_by_key.items():
        insert_rows(sb, rows, key)

    print()
    print(f'✓ Done — {grand_total:,} pixels inserted across {len(NEIGHBORHOODS)} neighborhoods.')


if __name__ == '__main__':
    main()
