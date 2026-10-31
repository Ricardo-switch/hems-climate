/*
 * Vandaag, in ontwerp 2 (besluit 104; schetsen Wand-Vandaag en Vandaag). De dag
 * als tijdlijn: de zon, de temperatuur per kamer, en per apparaat wanneer het
 * draaide. Links van nu wat er gebeurde, en waarom; rechts wat er verwacht wordt.
 *
 * Eerlijk over het plan (besluit 104): een plan per kamer komt met het
 * thermisch model (D). Tot dan staat rechts van nu wat het weer en het huis
 * zelf zeggen: de verwachte zon (besluit 105), en per kamer die op zon wacht
 * wanneer er naar verwachting genoeg over is.
 *
 * Verwacht naast echt (besluit 137): boven de grafiek wat er opgewekt is naast
 * wat de dag ervoor werd verwacht, en bij Gisteren per dag van de afgelopen
 * twee weken hoe goed de verwachting klopte.
 */
'use strict';

const { $$, nl, esc, klokVan, haal } = app;
// De teksten staan in kit/teksten.*.js (besluit 185).
const { t } = taal;

let state = null;
let huisData = null;
let zon = null;
let weer = null;
const dagen = { vandaag: null, gisteren: null };
let dag = 'vandaag';
/** Welk moment de kaart links toont: een index in de lijst, of null voor het laatste. */
let gekozen = null;

async function laadAlles() {
  const [s, h, z, w, v] = await Promise.allSettled([haal('api/state'), haal('api/huis'), haal('api/zon'), haal('api/weer'), haal('api/vandaag')]);
  if (s.status === 'fulfilled') state = s.value;
  if (h.status === 'fulfilled') huisData = h.value;
  if (z.status === 'fulfilled') zon = z.value;
  if (w.status === 'fulfilled') weer = w.value;
  if (v.status === 'fulfilled') dagen.vandaag = v.value;
  teken();
}

async function laadGisteren() {
  if (dagen.gisteren) return;
  try {
    dagen.gisteren = await haal('api/vandaag?dag=gisteren');
  } catch {
    // Dan zegt de pagina dat er niets is.
  }
}

/* ------------------------------------------------------------ namen */

/** Het apparaat bij een actuator of id, zoals het huis het noemt. */
function apparaatVan(id) {
  for (const e of huisData?.etages ?? []) for (const r of e.ruimtes ?? []) for (const d of r.apparaten ?? []) if (d.actuatorId === id || d.id === id) return d;
  return null;
}

function naamVan(actuatorId) {
  for (const e of huisData?.etages ?? []) for (const r of e.ruimtes ?? []) for (const d of r.apparaten ?? []) if (d.actuatorId === actuatorId || d.id === actuatorId) return d.naam;
  return String(actuatorId).replace(/^ac-/, `${t('vandaag.airco')} `).replace(/[-_]+/g, ' ');
}
const hoofd = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------- verwacht naast echt */

/** Hoeveel er meer of minder kwam dan verwacht, als "+41%" of "−20%"; null zonder verwachting. */
function verschil(echt, verwacht) {
  if (echt == null || !(verwacht > 0)) return null;
  const p = Math.round(((echt - verwacht) / verwacht) * 100);
  return p > 0 ? `+${p}%` : p < 0 ? `−${-p}%` : '0%';
}

/** De verwachting van gisteren, naast wat er kwam: uit de terugblik, of anders uit de dag zelf. */
function gisterenGetallen(r) {
  const terug = (weer?.terugblik ?? []).find((d) => d.datum === weer?.gisteren?.datum);
  return { echt: terug?.werkelijkKwh ?? (r ? r.zonWh / 1000 : null), verwacht: terug?.verwachtKwh ?? null };
}

/** De getallen boven de grafiek: [waarde, wat het is], en hoeveel het afweek. */
function getallen(r) {
  if (dag === 'gisteren') {
    const g = gisterenGetallen(r);
    if (g.echt == null) return null;
    const zelf = r && r.zonWh > 0 ? Math.round(Math.max(0, Math.min(100, ((r.zonWh - r.netTerugWh) / r.zonWh) * 100))) : null;
    return {
      rij: [[`${nl(g.echt)} kWh`, t('vandaag.opgewekt')], ...(g.verwacht != null ? [[`${nl(g.verwacht)} kWh`, t('vandaag.verwacht')]] : [])],
      afwijking: verschil(g.echt, g.verwacht),
      noot: zelf != null ? t('vandaag.zelf', { pct: zelf }) : '',
    };
  }
  if (dag === 'vandaag') {
    const kwh = r ? r.zonWh / 1000 : weer?.vandaag?.opgewektKwh;
    if (kwh == null) return null;
    const vooraf = weer?.vandaag?.verwachtVoorafKwh;
    const nu = weer?.vandaag?.verwachtKwh;
    // Verwacht uit het weer en wat het huis leerde; hoe dat tot stand kwam, hoort niet in de app (besluit 167).
    const v = vooraf != null ? [`${nl(vooraf)} kWh`, t('vandaag.verwachtVandaag')] : nu != null ? [`${nl(nu)} kWh`, t('vandaag.verwachtVandaag')] : null;
    return { rij: [[`${nl(kwh)} kWh`, t('vandaag.totNu')], ...(v ? [v] : [])], afwijking: null, noot: '' };
  }
  const m = weer?.dagen?.[0];
  if (m?.verwachtKwh == null) return null;
  return { rij: [[`${nl(m.verwachtKwh)} kWh`, t('vandaag.verwacht')], ...(m.zonkansPct != null ? [[`${m.zonkansPct}%`, t('vandaag.kansZon')]] : [])], afwijking: null, noot: '' };
}

const KORTE_DAG = taal.opmaak({ weekday: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Zo klopte de verwachting: per dag een paar balken, gestippeld wat de dag
 * ervoor werd verwacht en vol wat er kwam, oudste links.
 */
function klopteHtml() {
  const lijst = [...(weer?.terugblik ?? [])].reverse();
  if (!lijst.length) {
    return { balken: '', zin: t('vandaag.klopteLeeg'), dagen: 0 };
  }
  const max = Math.max(1, ...lijst.map((d) => Math.max(d.verwachtKwh, d.werkelijkKwh)));
  const h = (kwh) => `${Math.max(2, (kwh / max) * 100).toFixed(1)}%`;
  const balken = lijst
    .map((d) => {
      const label = KORTE_DAG.format(new Date(`${d.datum}T12:00:00Z`)).replace('.', '');
      return `<div class="dag" role="listitem" aria-label="${esc(t('vandaag.klopteDag', { dag: label, verwacht: nl(d.verwachtKwh), echt: nl(d.werkelijkKwh) }))}"><b>${nl(d.werkelijkKwh)}</b><div class="paar"><i class="v" style="height: ${h(d.verwachtKwh)}"></i><i class="e" style="height: ${h(d.werkelijkKwh)}"></i></div><span>${esc(label)}</span></div>`;
    })
    .join('');
  const ernaast = lijst.reduce((som, d) => som + Math.abs(d.werkelijkKwh - d.verwachtKwh), 0) / lijst.length;
  const f = weer?.geleerd;
  const bij = f && f.dagen > 0 ? ` ${Math.abs(f.factor - 1) < 0.02 ? t('vandaag.houdt') : t(f.factor > 1 ? 'vandaag.hoger' : 'vandaag.lager', { pct: Math.round(Math.abs(f.factor - 1) * 100) })}` : '';
  return { balken: `<div class="klopte" role="list" style="--dagen: ${lijst.length}">${balken}</div>`, zin: `${t('vandaag.ernaast', { kwh: nl(ernaast) })}${bij}`, dagen: lijst.length };
}

const LEGENDA = () => `<span class="legenda"><span><i class="v"></i>${esc(t('vandaag.verwacht'))}</span><span><i class="e"></i>${esc(t('vandaag.opgewekt'))}</span></span>`;

/* ------------------------------------------------------- de momenten */

/** Wat een apparaat ging doen, op de actie in de opdracht van de dienst (besluit 185: niet op de woorden, die per taal verschillen). */
const DOET = new Set(['koelen', 'verwarmen', 'uit', 'geparkeerd', 'drogen', 'ventileren']);
const ACTIE = { cool: 'koelen', heat: 'verwarmen', off: 'uit', standby: 'geparkeerd' };
const KLEUR = { koelen: 'var(--ijs)', verwarmen: 'var(--gloed)', uit: 'var(--mint)', geparkeerd: 'var(--zon)' };

/** Een besluit van de dienst als moment: een kop, een zin, een kleur. */
function momentVan(b) {
  // De naam van het apparaat staat voor de dubbele punt, in elke taal.
  const [naam = '', woord = ''] = (b.wat[0] ?? '').split(': ');
  const eerste = b.opdrachten?.[0];
  const actie = eerste?.kind === 'setAction' ? (ACTIE[eerste.action] ?? woord) : eerste ? '' : woord;
  const sp = (b.opdrachten ?? []).find((o) => o.kind === 'setSetpoint')?.setpointC;
  const doel = sp != null ? `${nl(sp, Number.isInteger(sp) ? 0 : 1)}°` : null;
  const reden = (b.waarom[0] ?? '').split(': ').slice(1).join(': ');
  const kop = actie ? `${naam} ${DOET.has(actie) ? t(`vandaag.doet.${actie}`) : actie}` : hoofd(b.wat[0] ?? t('vandaag.besluit'));
  const zin = [reden ? `${hoofd(reden)}.` : '', doel && actie !== 'uit' ? t('vandaag.doel', { doel }) : ''].filter(Boolean).join(' ');
  return { tMs: b.tMs, kop, zin, kleur: KLEUR[actie] ?? 'var(--zacht)', actuatorId: b.redenen?.[0]?.actuatorId ?? null, naam, actie };
}

/** Zo heet een reeks in de verleden tijd. */
const DEED = new Set(['koelen', 'verwarmen', 'drogen', 'ventileren']);

/**
 * Een apparaat dat met de zon mee aan en uit gaat, geeft veel losse momenten
 * ("ging verwarmen", "wacht even", "ging verwarmen"). Momenten van hetzelfde
 * apparaat die binnen een half uur op elkaar volgen, worden één regel; tik
 * erop voor de losse momenten (rapport 15 oktober).
 */
function groepeer(lijst) {
  const uit = [];
  const open = new Map();
  for (const m of lijst) {
    const g = m.actuatorId && m.actie ? open.get(m.actuatorId) : null;
    if (g && m.tMs - g.leden.at(-1).tMs <= 30 * 60_000) {
      g.leden.push(m);
      continue;
    }
    if (m.actuatorId && m.actie) {
      const nieuw = { ...m, leden: [m] };
      open.set(m.actuatorId, nieuw);
      uit.push(nieuw);
    } else uit.push(m);
  }
  return uit.map((g) => {
    if (!g.leden || g.leden.length < 3) return g.leden ? g.leden : [g];
    const werk = g.leden.map((x) => x.actie).find((a) => DEED.has(a));
    const starts = g.leden.filter((x) => DEED.has(x.actie)).length;
    if (!werk || starts < 2) return g.leden;
    const wachtte = g.leden.some((x) => x.actie === 'geparkeerd');
    const eind = g.leden.at(-1);
    return [{
      tMs: g.tMs,
      kop: t('vandaag.metZonMee', { naam: g.naam, deed: t(`vandaag.deed.${werk}`) }),
      zin: t(wachtte ? 'vandaag.gestartGewacht' : 'vandaag.gestart', { van: klokVan(g.tMs), tot: klokVan(eind.tMs), n: starts }),
      kleur: KLEUR[werk] ?? 'var(--zacht)',
      actuatorId: g.actuatorId,
      leden: g.leden,
    }];
  }).flat();
}

/** Alle momenten van de dag, op tijd: de besluiten, en wanneer een uitstelbaar apparaat begon en klaar was. */
function momenten(r) {
  const lijst = [...(r?.besluiten ?? [])].reverse().map(momentVan);
  for (const u of r?.uitstelbaar ?? []) {
    const naam = naamVan(u.id);
    for (const s of u.draaide ?? []) {
      lijst.push({ tMs: s.vanMs, kop: t('vandaag.begon', { naam }), zin: t('vandaag.opApparaat'), kleur: 'var(--zon)', actuatorId: u.id });
      if (r.totMs - s.totMs > 5 * 60_000) lijst.push({ tMs: s.totMs, kop: t('vandaag.isKlaar', { naam }), zin: t('vandaag.liep', { duur: duur(s.totMs - s.vanMs) }), kleur: 'var(--mint)', actuatorId: u.id });
    }
  }
  return groepeer(lijst.sort((a, b) => a.tMs - b.tMs));
}

const duur = (ms) => {
  const min = Math.round(ms / 60_000);
  const uren = t('vandaag.uur', { n: Math.floor(min / 60) });
  return min >= 60 ? (min % 60 ? t('vandaag.urenEn', { uren, minuten: t('vandaag.minuten', { n: min % 60 }) }) : uren) : t('vandaag.minuten', { n: min });
};

/**
 * Wat er rechts van nu verwacht wordt: per kamer die op zon wacht, het eerste
 * kwartier waarin de verwachte zon min wat het huis nu gebruikt genoeg is.
 */
function verwachtingen() {
  if (dag !== 'vandaag') return [];
  const kw = weer?.vandaag?.kwartieren ?? [];
  const huisW = (state?.bewoner?.stromen?.huisKw ?? 0) * 1000;
  const nu = Date.now();
  const uit = [];
  const gezien = new Set();
  for (const r of state?.rejected ?? []) {
    if (r.blockedBy !== 'insufficient_power_budget' || !(r.intent?.budgetW > 0) || gezien.has(r.intent.actuatorId)) continue;
    gezien.add(r.intent.actuatorId);
    const genoeg = kw.filter((q) => q.tMs + 15 * 60_000 > nu && q.verwachtW - huisW >= r.intent.budgetW);
    const kamer = (huisData?.etages ?? []).flatMap((e) => e.ruimtes ?? []).find((x) => x.zoneId === r.intent.zoneId);
    const zone = hoofd(app.metLidwoord(kamer?.naam ?? String(r.intent.zoneId).replace(/[-_]+/g, ' ')));
    uit.push({
      actuatorId: r.intent.actuatorId,
      vanMs: genoeg[0]?.tMs ?? null,
      totMs: genoeg.length ? genoeg[genoeg.length - 1].tMs + 15 * 60_000 : null,
      kop: t(r.intent.action === 'heat' ? 'thuis.straks.warm' : 'thuis.straks.koel', { zone, kw: nl(r.intent.budgetW / 1000) }),
      zin: genoeg.length ? t('vandaag.rond', { klok: klokVan(genoeg[0].tMs) }) : t('vandaag.nietGenoeg'),
    });
  }
  // Een uitstelbaar apparaat dat draait: wanneer het klaar is.
  for (const d of state?.bewoner?.uitstelbaar ?? []) {
    // Klaar met drogen, ook al draait de trommel nog tegen kreuken (besluit 167): niets meer te verwachten.
    if (d.stand !== 'running' || d.klaarSindsMs != null || (!d.duurMin && d.restMin == null)) continue;
    const s = (dagen.vandaag?.uitstelbaar ?? []).find((u) => u.id === d.id)?.draaide?.at(-1);
    if (!s) continue;
    const klaar = d.restMin != null ? nu + d.restMin * 60_000 : s.vanMs + d.duurMin * 60_000;
    if (klaar > nu) uit.push({ actuatorId: d.id, vanMs: nu, totMs: klaar, kop: t('vandaag.klaarRond', { naam: d.naam, klok: klokVan(klaar) }), zin: t(d.restMin != null ? 'vandaag.uitRest' : 'vandaag.uitDuur') });
  }
  return uit;
}

/* --------------------------------------------------------- de tijdlijn */

/*
 * De breedte volgt het vak (besluit 129): op een bredere wand, zoals een liggende
 * telefoon, groeide de grafiek anders mee in de hoogte en duwde hij de kaarten
 * eronder van het scherm.
 */
let W = 1116;
const X0 = 140;
let X1 = 1100;

function tekenTijdlijn(r, verwacht, lijst) {
  const box = document.querySelector('[data-tijdlijn]');
  W = Math.max(1116, Math.round(box.clientWidth - 40) || 1116);
  X1 = W - 16;
  if (!r && dag !== 'morgen') {
    box.innerHTML = `<p class="klein" style="margin: 8px 0">${esc(t('vandaag.nietsGelogd'))}</p>`;
    return;
  }
  const van = dag === 'morgen' ? Date.parse(`${weer?.dagen?.[0]?.datum ?? ''}T00:00:00`) : r.vanMs;
  const t0 = (dag === 'morgen' ? weer?.dagen?.[0]?.kwartieren?.[0]?.tMs : van) ?? van;
  const tA = t0 + 6 * 3_600_000;
  const tB = t0 + 24 * 3_600_000;
  const x = (t) => X0 + Math.max(0, Math.min(1, (t - tA) / (tB - tA))) * (X1 - X0);
  const nu = Date.now();
  const nuX = dag === 'vandaag' ? x(nu) : null;

  // De rijen: de zon, de kamers met een regeling en metingen, de apparaten.
  // Elke kamer met een regeling (15 oktober 2026): eerst stonden er hooguit twee, en viel Beneden weg.
  const zones = dag === 'morgen' ? [] : (r.zones ?? []).filter((z) => z.kwartieren.some((q) => q != null));
  const banen = [];
  if (dag !== 'morgen') {
    for (const a of r.apparaten ?? []) if (a.huidig.length || a.smartClimate.length) banen.push({ id: a.actuatorId, naam: naamVan(a.actuatorId), echt: a.huidig, zou: a.smartClimate, kleur: /heat/.test(a.huidig[0]?.actie ?? '') || apparaatVan(a.actuatorId)?.klimaat?.kanKoelen === false ? '#FF7A4D' : '#6FD3FF' });
    for (const u of r.uitstelbaar ?? []) if (u.draaide.length || u.zouStarten.length) banen.push({ id: u.id, naam: naamVan(u.id), echt: u.draaide, zou: u.zouStarten, kleur: '#F7B548' });
    // De boiler en de jacuzzi (besluit 186): wanneer ze stookten, en wanneer SunArc dat zou doen.
    for (const w of r.warmtebuffers ?? []) if (w.stookte.length || w.zouStoken.length) banen.push({ id: w.id, naam: naamVan(w.id), echt: w.stookte, zou: w.zouStoken, kleur: '#FF9A6B' });
  }
  for (const v of verwacht) if (!banen.some((b) => b.id === v.actuatorId)) banen.push({ id: v.actuatorId, naam: naamVan(v.actuatorId), echt: [], zou: [], kleur: '#6FD3FF' });

  const zonTop = 30;
  const zonH = 80;
  const zoneTop = zonTop + zonH + 18;
  // Meer kamers: smallere rijen, zodat de wand niet gaat scrollen.
  const ruimte = 330 - zoneTop - Math.max(1, banen.length) * 22;
  const zoneH = zones.length ? Math.max(26, Math.min(50, ruimte / zones.length - 10)) : 50;
  const baanTop = zoneTop + zones.length * (zoneH + 10) + 8;
  const baan = Math.min(30, Math.max(22, (346 - baanTop) / Math.max(1, banen.length)));
  const hoog = Math.max(380, baanTop + banen.length * baan + 30);

  // De zon: gemeten tot nu, en verwacht (gestippeld).
  const gemeten = dag === 'morgen' ? [] : (r.kwartieren ?? []).filter((q) => q.tMs >= tA - 15 * 60_000);
  const verwachtLijn = dag === 'vandaag' ? (weer?.vandaag?.kwartieren ?? []).filter((q) => q.tMs >= tA) : dag === 'morgen' ? (weer?.dagen?.[0]?.kwartieren ?? []).filter((q) => q.tMs >= tA) : [];
  const gisterLijn = dag === 'gisteren' && weer?.gisteren ? weer.gisteren.kwartieren.map((w, i) => ({ tMs: r.vanMs + i * 15 * 60_000, verwachtW: w })).filter((q) => q.tMs >= tA) : [];
  const max = Math.max(1500, ...gemeten.map((q) => q.zonW ?? 0), ...verwachtLijn.map((q) => q.verwachtW), ...gisterLijn.map((q) => q.verwachtW));
  const y = (w) => zonTop + zonH - (w / max) * zonH;
  const pad = (punten, waarde) => punten.map((q, i) => `${i ? 'L' : 'M'} ${x(q.tMs).toFixed(1)} ${y(waarde(q)).toFixed(1)}`).join(' ');
  const echtPad = pad(gemeten, (q) => q.zonW ?? 0);
  const echtVlak = gemeten.length ? `${echtPad} L ${x(gemeten.at(-1).tMs).toFixed(1)} ${y(0)} L ${x(gemeten[0].tMs).toFixed(1)} ${y(0)} Z` : '';
  const toekomst = dag === 'vandaag' ? verwachtLijn.filter((q) => q.tMs >= nu - 15 * 60_000) : verwachtLijn;
  const verwachtPad = pad(toekomst, (q) => q.verwachtW);
  const gisterPad = pad(gisterLijn, (q) => q.verwachtW);

  // De kamers: de temperatuur, met wat er goed is als band.
  const zoneSvg = zones
    .map((z, i) => {
      const top = zoneTop + i * (zoneH + 10);
      const temps = z.kwartieren.filter((q) => q != null);
      const lo = Math.min(...temps, z.goed.vanC ?? Infinity) - 0.5;
      const hi = Math.max(...temps, z.goed.totC ?? -Infinity) + 0.5;
      const yt = (c) => top + zoneH - ((c - lo) / (hi - lo)) * zoneH;
      const band = z.goed.vanC != null && z.goed.totC != null ? `<rect x="${X0}" y="${yt(z.goed.totC).toFixed(1)}" width="${X1 - X0}" height="${(yt(z.goed.vanC) - yt(z.goed.totC)).toFixed(1)}" fill="#6EE7B7" opacity="0.07"/>` : '';
      const punten = z.kwartieren.map((c, q) => (c == null ? null : { tMs: r.vanMs + q * 15 * 60_000, c })).filter((p) => p && p.tMs >= tA);
      const lijn = punten.map((p, k) => `${k ? 'L' : 'M'} ${x(p.tMs).toFixed(1)} ${yt(p.c).toFixed(1)}`).join(' ');
      const warmst = punten.reduce((a, b) => (b.c > (a?.c ?? -Infinity) ? b : a), null);
      const goed = z.goed.vanC != null && z.goed.totC != null ? t('vandaag.goed', { van: nl(z.goed.vanC, 0), tot: nl(z.goed.totC, 0) }) : '';
      return `${band}<text x="0" y="${top + Math.min(20, zoneH / 2 + 4)}" class="rij">${esc(z.naam)}</text>${zoneH >= 40 ? `<text x="0" y="${top + 38}" class="sub">${esc(goed)}</text>` : ''}
        <path d="${lijn}" fill="none" stroke="#EEF3F7" stroke-width="2.2"/>
        ${warmst ? `<circle cx="${x(warmst.tMs).toFixed(1)}" cy="${yt(warmst.c).toFixed(1)}" r="4" fill="#EEF3F7"/><text x="${(x(warmst.tMs) - 8 < X0 + 150 ? x(warmst.tMs) + 8 : x(warmst.tMs) - 8).toFixed(1)}" y="${(yt(warmst.c) - 8).toFixed(1)}" text-anchor="${x(warmst.tMs) - 8 < X0 + 150 ? 'start' : 'end'}" class="sub">${esc(t('vandaag.warmste', { graden: nl(warmst.c) }))}</text>` : ''}`;
    })
    .join('');

  // De apparaten: vol wat het deed, licht wat SunArc zou doen, gestreept wat er verwacht wordt.
  // Achter het blok, of ervoor als het anders buiten de tijdlijn valt (besluit 131).
  const verwachtTekst = (v, tekst, yy) => {
    const rechts = x(v.totMs) + 8 + tekst.length * 6.4 <= X1;
    return `<text x="${(rechts ? x(v.totMs) + 8 : x(v.vanMs) - 8).toFixed(1)}" y="${yy + 11}" text-anchor="${rechts ? 'start' : 'end'}" class="sub">${esc(tekst)}</text>`;
  };
  const baanSvg = banen
    .map((b, i) => {
      const yy = baanTop + i * baan;
      const blok = (s, stijl) => `<rect x="${x(s.vanMs).toFixed(1)}" y="${yy}" width="${Math.max(3, x(s.totMs) - x(s.vanMs)).toFixed(1)}" height="12" rx="6" ${stijl}/>`;
      const v = verwacht.find((e) => e.actuatorId === b.id && e.vanMs != null);
      const dots = lijst
        .map((m, k) => ({ m, k }))
        .filter(({ m }) => m.actuatorId === b.id && m.tMs >= tA)
        .map(({ m, k }) => `<circle class="stip" tabindex="0" role="button" aria-label="${esc(`${klokVan(m.tMs)}, ${m.kop}`)}" data-moment="${k}" cx="${x(m.tMs).toFixed(1)}" cy="${yy + 6}" r="${k === gekozenIndex(lijst) ? 7 : 5}" fill="#0b1424" stroke="${b.kleur}" stroke-width="2.5"/>`)
        .join('');
      return `<text x="0" y="${yy + 11}" class="rij">${esc(b.naam)}</text>
        <rect x="${X0}" y="${yy}" width="${X1 - X0}" height="12" rx="6" fill="rgba(255,255,255,0.04)"/>
        ${b.zou.map((s) => blok(s, `fill="${b.kleur}" opacity="0.3"`)).join('')}
        ${b.echt.map((s) => blok(s, `fill="${b.kleur}"`)).join('')}
        ${v ? `${blok({ vanMs: v.vanMs, totMs: v.totMs }, `fill="url(#streep)" style="color: ${b.kleur}" opacity="0.55"`)}${verwachtTekst(v, t(apparaatVan(b.id)?.klimaat?.kanKoelen ? 'vandaag.genoegZon' : 'vandaag.nogTeGaan'), yy)}` : ''}
        ${dots}`;
    })
    .join('');

  const uren = [6, 9, 12, 15, 18, 21, 24].map((u) => `<text x="${x(t0 + u * 3_600_000).toFixed(1)}" y="${hoog - 8}" text-anchor="middle">${String(u).padStart(2, '0')}</text>`).join('');
  const rasters = [6, 9, 12, 15, 18, 21].map((u) => `<line x1="${x(t0 + u * 3_600_000).toFixed(1)}" y1="26" x2="${x(t0 + u * 3_600_000).toFixed(1)}" y2="${hoog - 30}"/>`).join('');
  const planTekst = (sleutel) => `<text x="${X1 - 8}" y="18" text-anchor="end" class="plan">${esc(t(sleutel))}</text>`;
  const planVlak = dag === 'vandaag' ? `<rect x="${nuX.toFixed(1)}" y="0" width="${(X1 - nuX).toFixed(1)}" height="${hoog - 30}" fill="url(#plan)" rx="12"/>${planTekst('vandaag.plan')}` : dag === 'morgen' ? planTekst('vandaag.plan') : weer?.gisteren ? planTekst('vandaag.gestippeldGisteren') : '';
  const g = getallen(r);
  const getallenSvg = g
    ? `<text x="${X0}" y="20">${g.rij.map(([w, l], i) => `<tspan class="getal"${i ? ' dx="22" fill="#B8C4CF"' : ''}>${esc(w)}</tspan><tspan class="sub" dx="6">${esc(l)}</tspan>`).join('')}${g.afwijking ? `<tspan class="af${g.afwijking.startsWith('+') ? '' : ' min'}" dx="16">${esc(g.afwijking)}</tspan>` : ''}${g.noot ? `<tspan class="sub" dx="16">${esc(g.noot)}</tspan>` : ''}</text>`
    : '';
  const nuStreep = nuX == null ? '' : `<line x1="${nuX.toFixed(1)}" y1="26" x2="${nuX.toFixed(1)}" y2="${hoog - 30}" stroke="#EEF3F7" stroke-width="1.5"/><rect x="${(nuX - 22).toFixed(1)}" y="${hoog - 30}" width="44" height="20" rx="10" fill="#EEF3F7"/><text x="${nuX.toFixed(1)}" y="${hoog - 16}" text-anchor="middle" class="nu">${esc(t('thuis.nuKlein'))}</text>`;

  box.innerHTML = `<svg viewBox="0 0 ${W} ${hoog}" role="img" aria-label="${esc(t('vandaag.tijdlijn'))}">
    <defs>
      <linearGradient id="zv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7B548" stop-opacity="0.5"/><stop offset="1" stop-color="#F7B548" stop-opacity="0.02"/></linearGradient>
      <linearGradient id="plan" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8F86FF" stop-opacity="0.13"/><stop offset="1" stop-color="#8F86FF" stop-opacity="0.03"/></linearGradient>
      <pattern id="streep" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="currentColor"/></pattern>
      <style>.rij{font:600 13px Figtree,sans-serif;fill:var(--tekst)}.sub{font:11.5px Figtree,sans-serif;fill:var(--gedempt)}.plan{font:600 12px Figtree,sans-serif;fill:var(--violet-t)}.nu{font:700 12px Figtree,sans-serif;fill:#0b1424}.getal{font:600 18px 'Bricolage Grotesque',Figtree,sans-serif;fill:var(--tekst)}.af{font:700 12.5px Figtree,sans-serif;fill:#6EE7B7}.af.min{fill:var(--zacht)}</style>
    </defs>
    ${planVlak}
    ${getallenSvg}
    <g stroke="#ffffff" stroke-opacity="0.05">${rasters}</g>
    <text x="0" y="66" class="rij">${esc(t('vandaag.zon'))}</text><text x="0" y="84" class="sub">${esc(t('vandaag.jePanelen'))}</text>
    ${echtVlak ? `<path d="${echtVlak}" fill="url(#zv)"/><path d="${echtPad}" fill="none" stroke="#F7B548" stroke-width="2.2"/>` : ''}
    ${verwachtPad ? `<path d="${verwachtPad}" fill="none" stroke="#F7B548" stroke-width="2" stroke-dasharray="5 5" opacity="0.85"/>` : ''}
    ${gisterPad ? `<path d="${gisterPad}" fill="none" stroke="#EEF3F7" stroke-width="1.6" stroke-dasharray="4 5" opacity="0.6"/>` : ''}
    ${zoneSvg}
    ${baanSvg}
    ${nuStreep}
    <g font-family="Figtree" font-size="11" fill="#7F8E9C">${uren}</g>
  </svg>`;
}

/* ---------------------------------------------------------- de kaarten */

function gekozenIndex(lijst) {
  if (!lijst.length) return -1;
  return gekozen == null ? lijst.length - 1 : Math.max(0, Math.min(lijst.length - 1, gekozen));
}

function tekenKaarten(r, verwacht, lijst) {
  const links = document.querySelector('[data-momentkaart]');
  const i = gekozenIndex(lijst);
  if (dag === 'morgen') {
    const m = weer?.dagen?.[0];
    links.innerHTML = m
      ? `<div class="bovenrij"><span class="wanneer zon-t">${esc(t('vandaag.morgenWeer'))}</span><span class="mini">${esc(weer?.bron ?? 'Buienradar')}</span></div><h2 class="kop-2" style="margin-top: 8px">${esc(m.tekst ?? t('thuis.weer.kop'))}${m.maxC != null ? `, ${nl(m.maxC, 0)}°` : ''}</h2><p class="klein" style="margin: 8px 0 0">${esc([m.zonkansPct != null ? t('vandaag.kansZonPct', { pct: m.zonkansPct }) : '', m.regenkansPct != null ? t('vandaag.kansRegenPct', { pct: m.regenkansPct }) : ''].filter(Boolean).join(', '))}. ${esc(m.verwachtKwh == null ? t('vandaag.levertOnbekend') : t('vandaag.levert', { kwh: nl(m.verwachtKwh) }))}</p>`
      : `<p class="klein">${esc(t('vandaag.geenMorgen'))}</p>`;
  } else if (i < 0) {
    links.innerHTML = `<span class="wanneer">${esc(t(dag === 'gisteren' ? 'vandaag.gisteren' : 'vandaag.vandaag'))}</span><h2 class="kop-2" style="margin-top: 8px">${esc(t('vandaag.nogNiets'))}</h2><p class="klein" style="margin: 8px 0 0">${esc(t('vandaag.geenStand'))}</p>`;
  } else {
    const m = lijst[i];
    links.innerHTML = `<div class="bovenrij"><span class="wanneer" style="color: ${app.tekstKleur(m.kleur)}">${esc(t('vandaag.watGebeurde', { klok: klokVan(m.tMs) }))}</span><span class="mini">${esc(t('vandaag.vanDe', { nr: i + 1, van: lijst.length }))}</span></div>
      <h2 class="kop-2" style="margin-top: 8px">${esc(m.kop)}</h2>
      <p class="klein" style="margin: 8px 0 0">${esc(m.zin)}</p>
      <div class="bladeren"><button type="button" data-blader="-1" ${i === 0 ? 'disabled' : ''}>‹ ${esc(t('vandaag.eerder'))}</button><button type="button" data-blader="1" ${i === lijst.length - 1 ? 'disabled' : ''}>${esc(t('vandaag.later'))} ›</button></div>`;
  }

  const rechts = document.querySelector('[data-verwacht]');
  const m = weer?.dagen?.[0];
  // Wat er morgen van je dak komt, in één zin; voor de avond en voor Morgen.
  const morgenZin = m?.verwachtKwh != null ? t(m.tekst ? 'vandaag.morgenVerwachtTekst' : 'vandaag.morgenVerwacht', { kwh: nl(m.verwachtKwh), tekst: m.tekst?.toLowerCase() }) : '';
  if (dag === 'vandaag') {
    const v = verwacht[0];
    const rest = weer?.vandaag?.verwachtKwh != null && weer?.vandaag?.opgewektKwh != null ? Math.max(0, weer.vandaag.verwachtKwh - weer.vandaag.opgewektKwh) : null;
    const onder = zon?.zon?.boven === false;
    rechts.innerHTML = v
      ? `<div class="bovenrij"><span class="wanneer" style="color: var(--violet-t)">${esc(v.vanMs ? t('vandaag.klokVerwacht', { klok: klokVan(v.vanMs) }) : t('thuis.kaart.straks'))}</span><span class="mini">${esc(t('vandaag.uitWeer'))}</span></div><h2 class="kop-2" style="margin-top: 8px">${esc(v.kop)}</h2><p class="klein" style="margin: 8px 0 0">${esc(v.zin)}</p>`
      : `<div class="bovenrij"><span class="wanneer" style="color: var(--violet-t)">${esc(t('vandaag.rest'))}</span><span class="mini">${esc(t('vandaag.uitWeer'))}</span></div><h2 class="kop-2" style="margin-top: 8px">${esc(!onder && rest != null && rest > 0.05 ? t('vandaag.nogZon', { kwh: nl(rest) }) : t(onder ? 'vandaag.zonOnder' : 'vandaag.weinigZon'))}</h2><p class="klein" style="margin: 8px 0 0">${esc(!onder && rest != null && rest > 0.05 ? t('vandaag.nietsWacht') : morgenZin || t('vandaag.nietsWacht'))}</p>`;
  } else if (dag === 'gisteren') {
    const k = klopteHtml();
    rechts.innerHTML = `<div class="bovenrij"><span class="wanneer" style="color: var(--violet-t)">${esc(t('vandaag.klopte'))}</span><span class="mini">${k.dagen ? esc(t('vandaag.dagen', { n: k.dagen })) : ''}</span></div>
      ${k.balken}
      <div class="bovenrij" style="margin-top: 8px"><p class="mini" style="margin: 0">${esc(k.zin)}</p>${k.dagen ? LEGENDA() : ''}</div>`;
  } else {
    // Wanneer de zon er morgen is: de kwartieren boven 60% van het hoogste punt.
    const kw = m?.kwartieren ?? [];
    const piek = Math.max(0, ...kw.map((q) => q.verwachtW));
    const goed = kw.filter((q) => piek > 0 && q.verwachtW >= piek * 0.6);
    rechts.innerHTML = goed.length && piek >= 200
      ? `<div class="bovenrij"><span class="wanneer" style="color: var(--violet-t)">${esc(t('vandaag.meesteZon'))}</span><span class="mini">${esc(t('vandaag.uitWeer'))}</span></div><h2 class="kop-2" style="margin-top: 8px">${esc(t('vandaag.tussen', { van: klokVan(goed[0].tMs), tot: klokVan(goed.at(-1).tMs + 15 * 60_000) }))}</h2><p class="klein" style="margin: 8px 0 0">${esc(t('vandaag.piek', { kw: nl(piek / 1000) }))}</p>`
      : `<div class="bovenrij"><span class="wanneer" style="color: var(--violet-t)">${esc(t('vandaag.morgenZon'))}</span><span class="mini">${esc(t('vandaag.uitWeer'))}</span></div><h2 class="kop-2" style="margin-top: 8px">${esc(t('vandaag.weinigVerwacht'))}</h2><p class="klein" style="margin: 8px 0 0">${esc(morgenZin || t('vandaag.geenMorgen'))}</p>`;
  }
}

/* --------------------------------------------------------- de telefoon */

function tekenTelefoon(r, verwacht, lijst) {
  const kaart = document.querySelector('[data-zonkaart]');
  const t0 = r?.vanMs ?? Date.now();
  const tA = t0 + 6 * 3_600_000;
  const tB = t0 + 22 * 3_600_000;
  const x = (t) => 6 + Math.max(0, Math.min(1, (t - tA) / (tB - tA))) * 314;
  const gemeten = dag === 'morgen' ? [] : (r?.kwartieren ?? []).filter((q) => q.tMs >= tA);
  const verwachtLijn = dag === 'vandaag' ? (weer?.vandaag?.kwartieren ?? []).filter((q) => q.tMs >= Date.now() - 15 * 60_000) : dag === 'morgen' ? weer?.dagen?.[0]?.kwartieren ?? [] : [];
  const max = Math.max(1500, ...gemeten.map((q) => q.zonW ?? 0), ...verwachtLijn.map((q) => q.verwachtW));
  const y = (w) => 76 - (w / max) * 66;
  const echt = gemeten.map((q, i) => `${i ? 'L' : 'M'} ${x(q.tMs).toFixed(1)} ${y(q.zonW ?? 0).toFixed(1)}`).join(' ');
  const komt = verwachtLijn.filter((q) => dag !== 'morgen' || q.tMs >= (weer?.dagen?.[0]?.kwartieren?.[0]?.tMs ?? 0)).map((q, i) => `${i ? 'L' : 'M'} ${x(dag === 'morgen' ? q.tMs - 86_400_000 : q.tMs).toFixed(1)} ${y(q.verwachtW).toFixed(1)}`).join(' ');
  const gisterLijn = dag === 'gisteren' && weer?.gisteren && r ? weer.gisteren.kwartieren.map((w, i) => ({ tMs: r.vanMs + i * 15 * 60_000, w })).filter((q) => q.tMs >= tA) : [];
  const was = gisterLijn.map((q, i) => `${i ? 'L' : 'M'} ${x(q.tMs).toFixed(1)} ${y(q.w).toFixed(1)}`).join(' ');
  const kwh = dag === 'morgen' ? null : (r?.zonWh ?? 0) / 1000;
  const rest = dag === 'vandaag' && weer?.vandaag?.verwachtKwh != null ? Math.max(0, weer.vandaag.verwachtKwh - kwh) : null;
  const regel = (() => {
    if (dag === 'morgen') return weer?.dagen?.[0]?.verwachtKwh == null ? '' : t('vandaag.kwhVerwacht', { kwh: nl(weer.dagen[0].verwachtKwh) });
    if (dag === 'gisteren') {
      const g = gisterenGetallen(r);
      return g.echt == null ? '' : g.verwacht != null ? t('vandaag.kwhVerwachtAf', { kwh: nl(g.echt), verwacht: nl(g.verwacht), af: verschil(g.echt, g.verwacht) }) : `${nl(g.echt)} kWh`;
    }
    const vooraf = weer?.vandaag?.verwachtVoorafKwh;
    return vooraf != null ? t('thuis.vandaag.verwacht', { kwh: nl(kwh), verwacht: nl(vooraf) }) : rest != null ? t('vandaag.nogVerwacht', { kwh: nl(kwh), rest: nl(rest) }) : `${nl(kwh)} kWh`;
  })();
  kaart.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: baseline"><h2 class="kop-3">${esc(t('vandaag.zon'))}</h2><span class="mini">${esc(regel)}</span></div>
    <svg viewBox="0 0 326 92" width="100%" aria-label="${esc(t(`vandaag.zonVan.${dag}`))}">
      ${echt ? `<path d="${echt}" fill="none" stroke="#F7B548" stroke-width="2.2"/>` : ''}
      ${komt ? `<path d="${komt}" fill="none" stroke="#F7B548" stroke-width="2" stroke-dasharray="5 5"/>` : ''}
      ${was ? `<path d="${was}" fill="none" stroke="#EEF3F7" stroke-width="1.5" stroke-dasharray="4 5" opacity="0.6"/>` : ''}
      ${dag === 'vandaag' ? `<line x1="${x(Date.now()).toFixed(1)}" y1="4" x2="${x(Date.now()).toFixed(1)}" y2="80" stroke="#EEF3F7" stroke-opacity="0.7"/>` : ''}
      <g font-family="Figtree" font-size="10.5" fill="#7F8E9C"><text x="6" y="91">06</text><text x="112" y="91">12</text><text x="218" y="91">18</text><text x="304" y="91">22</text></g>
    </svg>`;

  // Bij gisteren: zo klopte de verwachting, de afgelopen twee weken.
  const klopte = document.querySelector('[data-klopte]');
  klopte.hidden = dag !== 'gisteren';
  if (dag === 'gisteren') {
    const k = klopteHtml();
    klopte.innerHTML = `<h2 class="kop-3">${esc(t('vandaag.klopte'))}</h2>${k.balken}${k.dagen ? `<div style="margin-top: 8px">${LEGENDA()}</div>` : ''}<p class="mini" style="margin: 6px 0 0">${esc(k.zin)}</p>`;
  }

  const lijn = document.querySelector('[data-lijn]');
  if (dag === 'morgen') {
    lijn.innerHTML = '';
  } else {
    const enkel = (m, klasse = '') => `<div class="glas-klein moment ${klasse}" style="--kleur: ${m.kleur}"><span class="tijd">${klokVan(m.tMs)}</span><b>${esc(m.kop)}</b><span class="klein">${esc(m.zin)}</span></div>`;
    // Een reeks met de zon mee: dicht één regel, open de losse momenten.
    const rij = (m, klasse = '') => (m.leden ? `<details class="reeks"><summary>${enkel(m, `${klasse} groep`)}</summary>${m.leden.map((x) => enkel(x, 'lid')).join('')}</details>` : enkel(m, klasse));
    const later = verwacht.filter((v) => v.vanMs != null).map((v) => rij({ tMs: v.vanMs, kop: v.kop, zin: v.zin, kleur: 'var(--violet)' }, 'verwacht'));
    lijn.innerHTML = [
      ...lijst.map((m) => rij(m)),
      dag === 'vandaag' ? `<div class="nu"><span>${klokVan(Date.now())}</span><i></i></div>` : '',
      ...later,
    ].join('') || `<p class="klein">${esc(t('vandaag.nogNietsPunt'))}</p>`;
  }
  document.querySelector('[data-voet]').textContent = t(dag === 'morgen' ? 'vandaag.voetMorgen' : 'vandaag.voet');
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, state?.bewoner?.stromen?.zonKw ?? 0);
  const keuzes = ['gisteren', 'vandaag', 'morgen'];
  $$('[data-wissel]').forEach((el) => (el.innerHTML = keuzes.map((k) => `<button type="button" data-dag="${k}" aria-pressed="${k === dag}">${esc(t(`vandaag.${k}`))}</button>`).join('')));
  $$('h1.kop-1').forEach((h) => (h.textContent = t(`vandaag.${dag}`)));
  document.querySelector('[data-lead]').textContent = t(`vandaag.lead.${dag}`);
  const r = dag === 'morgen' ? null : dagen[dag];
  const lijst = dag === 'morgen' ? [] : momenten(r);
  const verwacht = verwachtingen();
  if (!app.telStand()) {
    tekenTijdlijn(r, verwacht, lijst);
    tekenKaarten(r, verwacht, lijst);
  } else tekenTelefoon(r, verwacht, lijst);
}

/* -------------------------------------------------------------- starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

app.start('vandaag');
document.addEventListener('click', async (e) => {
  const knop = e.target.closest('[data-dag]');
  if (knop) {
    dag = knop.dataset.dag;
    gekozen = null;
    if (dag === 'gisteren') await laadGisteren();
    teken();
    return;
  }
  const blader = e.target.closest('[data-blader]');
  if (blader) {
    const lijst = momenten(dagen[dag]);
    gekozen = Math.max(0, Math.min(lijst.length - 1, gekozenIndex(lijst) + Number(blader.dataset.blader)));
    teken();
    return;
  }
  const stip = e.target.closest('[data-moment]');
  if (stip) {
    gekozen = Number(stip.dataset.moment);
    teken();
  }
});
document.addEventListener('keydown', (e) => {
  const stip = e.target.closest?.('[data-moment]');
  if (stip && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    gekozen = Number(stip.dataset.moment);
    teken();
  }
});
void laadAlles();
setInterval(() => void laadAlles(), 60_000);
app.live((nieuw) => {
  state = nieuw;
  teken();
});
