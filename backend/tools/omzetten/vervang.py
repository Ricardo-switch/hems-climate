"""Vervangt stukken tekst in een bestand: vervang.py <bestand> <paren.txt>.

paren.txt bevat blokken:
@@OUD
...
@@NIEUW
...
@@EIND
Elk oud stuk moet precies één keer passen (de regeleinden aan het eind van een blok tellen niet mee).
"""
import re, sys

pad, paren = sys.argv[1], sys.argv[2]
s = open(pad, encoding='utf-8').read()
tekst = open(paren, encoding='utf-8').read()
blokken = re.findall(r'@@OUD\n(.*?)\n@@NIEUW\n(.*?)\n?@@EIND', tekst, re.S)
for a, b in blokken:
    c = s.count(a)
    if c != 1:
        sys.exit(f"FOUT {c}x: {a[:160]}")
    s = s.replace(a, b)
open(pad, 'w', encoding='utf-8', newline='').write(s)
print(f'ok, {len(blokken)} vervangen')
