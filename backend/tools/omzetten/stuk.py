"""Vervangt een stuk van een bestand: stuk.py <bestand> <nieuw.txt> <begin> <eind>.

Van de regel die met <begin> begint (inclusief) tot de regel die met <eind>
begint (exclusief). Beide moeten precies één keer voorkomen.
"""
import sys

pad, nieuwpad, begin, eind = sys.argv[1:5]
s = open(pad, encoding='utf-8').read()
nieuw = open(nieuwpad, encoding='utf-8').read()
regels = s.split('\n')
b = [i for i, r in enumerate(regels) if r.startswith(begin)]
e = [i for i, r in enumerate(regels) if r.startswith(eind)]
if len(b) != 1 or len(e) != 1 or e[0] <= b[0]:
    sys.exit(f'FOUT: begin {len(b)}x, eind {len(e)}x')
uit = regels[:b[0]] + nieuw.rstrip('\n').split('\n') + regels[e[0]:]
open(pad, 'w', encoding='utf-8', newline='').write('\n'.join(uit))
print(f'ok, regels {b[0] + 1}-{e[0]} vervangen')
