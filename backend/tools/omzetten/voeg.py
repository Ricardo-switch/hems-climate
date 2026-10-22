"""Voegt een blok tekst in vóór een anker: voeg.py <bestand> <blok.txt> <anker>. Het anker moet precies één keer voorkomen."""
import sys

pad, blokpad, anker = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(pad, encoding='utf-8').read()
blok = open(blokpad, encoding='utf-8').read()
if s.count(anker) != 1:
    sys.exit(f'FOUT: anker {s.count(anker)}x')
open(pad, 'w', encoding='utf-8', newline='').write(s.replace(anker, blok + anker))
print('ok')
