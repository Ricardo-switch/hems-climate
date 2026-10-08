/*
 * De assistent, in ontwerp 2 (besluit 104; schets Wand-Assistent). Vaste
 * vragen; de antwoorden komen kant-en-klaar uit de dienst (`api/vraag`,
 * besluit 94). Links het antwoord, groot, met waar het op steunt; rechts het
 * huis met de kamer waar het over gaat.
 *
 * Het adres kan een vraag meegeven: `assistent.html#nu`, `#zon`, `#straks`,
 * `#waarom/zolder`. Zo stellen de knoppen op Thuis hun vraag meteen.
 */
'use strict';

const { $$, nl, esc, klokVan, haal } = app;

let state = null;
let huisData = null;
let zon = null;
let site = null;
let vandaag = null;
let weer = null;
/** De vragen met hun antwoord, nieuwste laatst; hooguit vijf. */
const gesprek = [];

async function laadAlles() {
  const [s, h, z, i, v, w] = await Promise.allSettled([haal('api/state'), haal('api/huis'), haal('api/zon'), haal('api/site'), haal('api/vandaag'), haal('api/weer')]);
  if (s.status === 'fulfilled') state = s.value;
  if (h.status === 'fulfilled') huisData = h.value;
  if (z.status === 'fulfilled') zon = z.value;
  if (i.status === 'fulfilled') site = i.value;
  if (v.status === 'fulfilled') vandaag = v.value;
  if (w.status === 'fulfilled') weer = w.value;
  teken();
}

/* ------------------------------------------------------------ de vragen */

function vragen() {
  const zones = site?.zones ?? [];
  return [
    { label: 'Wat doe je nu?', soort: 'nu' },
    ...zones.map((z) => ({ label: `Waarom de ${z.name.toLowerCase()}?`, soort: 'waarom', kamer: z.id })),
    { label: 'Wat ga je straks doen?', soort: 'straks' },
    { label: 'Hoeveel zon vandaag?', soort: 'zon' },
  ];
}

async function vraag(v) {
  const item = { ...v, antwoord: null, kamerId: v.kamer ?? null, feiten: [] };
  gesprek.push(item);
  while (gesprek.length > 5) gesprek.shift();
  teken();
  try {
    const q = new URLSearchParams({ v: v.soort, ...(v.kamer ? { kamer: v.kamer } : {}) });
    const res = await fetch(`api/vraag?${q}`);
    const body = await res.json();
    item.antwoord = res.ok ? body.antwoord : body.fout ?? body.wachten ?? 'Geen antwoord.';
    item.kamerId = body.kamer ?? item.kamerId;
    item.feiten = body.feiten ?? [];
  } catch {
    item.antwoord = 'Geen verbinding met Smart Climate.';
  }
  teken();
}

/** Waar een feit vandaan komt, in gewone woorden; wat hier niet staat, toont de pagina niet. */
const FEIT = { temperatuur: 'temperatuur', doel: 'doel', zonWh: 'opgewekt', piekW: 'piek', piekTijd: 'om', netAfWh: 'van het net', netTerugWh: 'terug', vermogen: 'nu', vocht: 'vocht' };
function feitNaam(bron) {
  const delen = String(bron).split('.');
  const woord = FEIT[delen.at(-1)];
  if (!woord) return null;
  // "zone.zolder.temperatuur" wordt "zolder temperatuur"; "vandaag.zonWh" wordt "opgewekt".
  return delen[0] === 'zone' && delen.length === 3 ? `${delen[1].replace(/[-_]+/g, ' ')} ${woord}` : woord;
}

/** De eerste zin groot, de rest als uitleg. */
function splits(tekst) {
  const m = /^(.+?[.!?])\s+(.*)$/s.exec(tekst ?? '');
  return m ? [m[1], m[2]] : [tekst ?? '', ''];
}

/* ------------------------------------------------------------ grafiekjes */

/** Bij "zon": vandaag gemeten en verwacht. Bij een kamer: de temperatuur van vandaag. */
function grafiek(item) {
  if (item.soort === 'zon' || item.soort === 'straks') {
    const kw = vandaag?.kwartieren ?? [];
    if (!kw.length) return '';
    const t0 = vandaag.vanMs + 6 * 3_600_000;
    const t1 = vandaag.vanMs + 22 * 3_600_000;
    const x = (t) => 10 + Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) * 450;
    const verwacht = (weer?.vandaag?.kwartieren ?? []).filter((q) => q.tMs >= Date.now() - 15 * 60_000);
    const max = Math.max(1500, ...kw.map((q) => q.zonW ?? 0), ...verwacht.map((q) => q.verwachtW));
    const y = (w) => 96 - (w / max) * 80;
    const echt = kw.filter((q) => q.tMs >= t0).map((q, i) => `${i ? 'L' : 'M'} ${x(q.tMs).toFixed(1)} ${y(q.zonW ?? 0).toFixed(1)}`).join(' ');
    const komt = verwacht.map((q, i) => `${i ? 'L' : 'M'} ${x(q.tMs).toFixed(1)} ${y(q.verwachtW).toFixed(1)}`).join(' ');
    const uren = [6, 10, 14, 18, 22].map((u) => `<text x="${x(vandaag.vanMs + u * 3_600_000).toFixed(1)}" y="116" text-anchor="middle">${String(u).padStart(2, '0')}</text>`).join('');
    return `<section class="glas grafiek"><div style="display: flex; justify-content: space-between; align-items: baseline"><h2 class="kop-3">De zon van vandaag</h2><span class="mini">${weer?.vandaag?.verwachtKwh != null ? `${nl(weer.vandaag.opgewektKwh)} van ${nl(weer.vandaag.verwachtKwh)} kWh verwacht` : `${nl((vandaag.zonWh ?? 0) / 1000)} kWh`}</span></div>
      <svg viewBox="0 0 470 120" role="img" aria-label="De zon van vandaag, gemeten en verwacht">
        ${echt ? `<path d="${echt}" fill="none" stroke="#F7B548" stroke-width="2.4"/>` : ''}
        ${komt ? `<path d="${komt}" fill="none" stroke="#F7B548" stroke-width="2" stroke-dasharray="5 5" opacity="0.8"/>` : ''}
        <line x1="${x(Date.now()).toFixed(1)}" y1="10" x2="${x(Date.now()).toFixed(1)}" y2="100" stroke="#EEF3F7" stroke-opacity="0.6"/>
        <g font-family="Figtree" font-size="11" fill="#7F8E9C">${uren}</g>
      </svg></section>`;
  }
  const z = (vandaag?.zones ?? []).find((x2) => x2.zoneId === item.kamerId);
  if (!z || !z.kwartieren.some((q) => q != null)) return '';
  const punten = z.kwartieren.map((c, i) => (c == null ? null : { t: vandaag.vanMs + i * 15 * 60_000, c })).filter(Boolean);
  const t0 = vandaag.vanMs;
  const t1 = t0 + 24 * 3_600_000;
  const lo = Math.min(...punten.map((p) => p.c), z.goed.vanC ?? Infinity) - 0.5;
  const hi = Math.max(...punten.map((p) => p.c), z.goed.totC ?? -Infinity) + 0.5;
  const x = (t) => 10 + ((t - t0) / (t1 - t0)) * 450;
  const y = (c) => 96 - ((c - lo) / (hi - lo)) * 80;
  const lijn = punten.map((p, i) => `${i ? 'L' : 'M'} ${x(p.t).toFixed(1)} ${y(p.c).toFixed(1)}`).join(' ');
  const band = z.goed.vanC != null && z.goed.totC != null ? `<rect x="10" y="${y(z.goed.totC).toFixed(1)}" width="450" height="${(y(z.goed.vanC) - y(z.goed.totC)).toFixed(1)}" fill="#6EE7B7" opacity="0.08"/>` : '';
  const laatste = punten.at(-1);
  return `<section class="glas grafiek"><div style="display: flex; justify-content: space-between; align-items: baseline"><h2 class="kop-3">De ${esc(z.naam.toLowerCase())} vandaag</h2><span class="mini">${z.goed.vanC != null && z.goed.totC != null ? `${nl(z.goed.vanC, 0)} tot ${nl(z.goed.totC, 0)}° is goed` : ''}</span></div>
    <svg viewBox="0 0 470 120" role="img" aria-label="De temperatuur van de ${esc(z.naam.toLowerCase())} vandaag">
      ${band}<path d="${lijn}" fill="none" stroke="#EEF3F7" stroke-width="2.2"/>
      <circle cx="${x(laatste.t).toFixed(1)}" cy="${y(laatste.c).toFixed(1)}" r="4" fill="#EEF3F7"/><text x="${(x(laatste.t) + 8).toFixed(1)}" y="${(y(laatste.c) + 4).toFixed(1)}" font-family="Figtree" font-size="12" fill="#B8C4CF">${nl(laatste.c)}° om ${klokVan(laatste.t)}</text>
      <g font-family="Figtree" font-size="11" fill="#7F8E9C">${[0, 6, 12, 18, 24].map((u) => `<text x="${x(t0 + u * 3_600_000).toFixed(1)}" y="116" text-anchor="middle">${String(u).padStart(2, '0')}</text>`).join('')}</g>
    </svg></section>`;
}

/* ------------------------------------------------------------ tekenen */

function tekenGesprek() {
  const laatste = gesprek.at(-1);
  const html = !laatste
    ? `<div class="antwoordrij"><span class="bol adem" style="width: 44px; height: 44px; flex: none; margin-top: 4px"></span><div><p class="antwoord">Vraag me iets over je huis.</p><p class="uitleg">Wat het nu doet, waarom een kamer wacht, wat er straks gebeurt, of hoeveel zon er vandaag komt. De antwoorden komen uit wat het huis meet en besluit.</p></div></div>`
    : (() => {
        const [kop, rest] = splits(laatste.antwoord);
        const feiten = (laatste.feiten ?? []).map((f) => ({ naam: feitNaam(f.bron), tekst: f.tekst })).filter((f) => f.naam).slice(0, 6).map((f) => `<span>${esc(f.naam)} <b>${esc(f.tekst)}</b></span>`).join('');
        const eerder = gesprek.slice(0, -1).reverse().map((g, i) => `<button type="button" data-terug="${gesprek.length - 2 - i}">${esc(g.label)}</button>`).join('');
        return `<div class="jij">${esc(laatste.label)}</div>
          <div class="antwoordrij"><span class="bol adem" style="width: 44px; height: 44px; flex: none; margin-top: 4px"></span><div>
            <p class="antwoord${kop.length > 90 ? ' lang' : ''}">${laatste.antwoord == null ? 'Even kijken…' : esc(kop)}</p>
            ${rest ? `<p class="uitleg">${esc(rest)}</p>` : ''}
            ${feiten ? `<div class="feiten" aria-label="Waar het antwoord op steunt">${feiten}</div>` : ''}
            ${laatste.antwoord == null ? '' : grafiek(laatste)}
          </div></div>
          ${eerder ? `<div class="eerder"><span class="mini">Eerder:</span>${eerder}</div>` : ''}`;
      })();
  $$('[data-gesprek]').forEach((el) => (el.innerHTML = html));
}

function tekenHuis() {
  if (!huisData) return;
  const kamer = gesprek.at(-1)?.kamerId ?? null;
  const etages = [];
  for (const e of [...(huisData.etages ?? [])].reverse()) {
    const binnen = (e.ruimtes ?? []).filter((r) => e.id !== 'buiten' && !huismodel.BUITEN.test(r.naam) && !huismodel.BUITEN.test(r.id));
    if (binnen.length) etages.push({ naam: e.naam, kamers: binnen.map((r) => ({ ...huismodel.kamerModel(r, state), stil: !!kamer && r.zoneId !== kamer, gekozen: !!kamer && r.zoneId === kamer })) });
  }
  const top = etages.at(-1);
  if (top && (etages.length >= 3 || /zolder|dak/i.test(top.naam))) top.dak = true;
  const model = { beschrijving: kamer ? `Het huis, met de ${huismodel.zoneNaam(kamer)} uitgelicht.` : 'Het huis.', tijd: app.tijdVanDeDag(zon), zon: zon?.dag ? { stand: zon.dag.fractie, aandeel: 0.4 } : { aandeel: 0 }, etages };
  huis.teken(document.getElementById('podium-wand'), model, { breedte: 620, hoogte: 580, marge: 0.06 });
  huis.teken(document.getElementById('podium-tel'), { ...model, etages: etages.map((e) => ({ ...e, kamers: e.kamers.map((k) => ({ ...k, stil: true })) })) }, { breedte: 390, hoogte: 280, marge: 0.04 });
}

function teken() {
  app.schaal();
  app.luchtVan(zon, state?.bewoner?.stromen?.zonKw ?? 0);
  const laatste = gesprek.at(-1);
  const knoppen = vragen().map((v, i) => `<button type="button" class="pil" data-vraag="${i}" aria-pressed="${!!laatste && laatste.soort === v.soort && (laatste.kamer ?? null) === (v.kamer ?? null)}">${esc(v.label)}</button>`).join('');
  $$('[data-vragen]').forEach((el) => (el.innerHTML = knoppen));
  tekenGesprek();
  tekenHuis();
}

/* -------------------------------------------------------------- starten */

app.start('assistent');
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-vraag]');
  if (b) {
    void vraag(vragen()[Number(b.dataset.vraag)]);
    return;
  }
  const t = e.target.closest('[data-terug]');
  if (t) {
    const [item] = gesprek.splice(Number(t.dataset.terug), 1);
    if (item) gesprek.push(item);
    teken();
  }
});
void laadAlles().then(() => {
  // Een vraag uit het adres: #nu, #zon, #straks, #waarom/zolder.
  const [soort, kamer] = decodeURIComponent(location.hash.slice(1)).split('/');
  const v = vragen().find((x) => x.soort === soort && (x.kamer ?? '') === (kamer ?? ''));
  if (v) void vraag(v);
});
setInterval(() => void laadAlles(), 60_000);
app.live((nieuw) => {
  state = nieuw;
  tekenHuis();
});
