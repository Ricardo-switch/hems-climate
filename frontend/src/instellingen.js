/*
 * Instellingen (besluit 130, schets Wand-Instellingen). Achter het tandwiel:
 * wat er nog mist, Wat je huis kan, en zes groepen die je herkent aan wat ze
 * regelen. Elke groep toont zijn belangrijkste waarden en of er iets mist.
 * Bedienen doe je in het huis; hier stel je in.
 */
'use strict';

const { $$, nl, esc, haal } = app;

/** Alles wat de pagina leest, per deur; null zolang die niets gaf. */
const d = { energie: null, aansluiting: null, huis: null, functies: null, comfort: null, site: null, sessie: null, export: null, health: null, zon: null };

async function laadAlles() {
  const deuren = { energie: 'api/energie', aansluiting: 'api/aansluiting', huis: 'api/huis', functies: 'api/functies', comfort: 'api/comfort', site: 'api/site', sessie: 'api/sessie', export: 'api/export/info', health: 'api/health', zon: 'api/zon' };
  const r = await Promise.allSettled(Object.values(deuren).map((p) => haal(p)));
  Object.keys(deuren).forEach((k, i) => {
    if (r[i].status === 'fulfilled') d[k] = r[i].value;
  });
  teken();
}

/* ----------------------------------------------------------- wat mist */

function mist() {
  const lijst = stand.nogTeDoen(d);
  if (!lijst.length) {
    return { klaar: true, html: '<h2 class="kop-3"><span class="stip" style="background: var(--mint)"></span>Alles staat goed</h2><p class="mini" style="margin: 2px 0 0">Er mist niets wat Smart Climate nodig heeft. Wat er nog bij kan, staat bij Wat je huis kan.</p>' };
  }
  const rijen = lijst.slice(0, 3).map((x) => `<div class="regel"><div><b>${esc(x.wat)}</b><span>${esc(x.waarom)}</span></div><a class="doe" href="${x.href}">${esc(x.knop)}</a></div>`).join('');
  return { klaar: false, html: `<h2 class="kop-3"><span class="stip" style="background: var(--gloed)"></span>Nog te doen</h2>${rijen}${lijst.length > 3 ? `<p class="mini" style="margin: 6px 0 0">En nog ${lijst.length - 3}.</p>` : ''}` };
}

function kan() {
  const k = window.stand.kan ? stand.kan(d) : null;
  const tel = (s) => (k ? k.filter((x) => x.stand === s).length : 0);
  const standen = k
    ? [['werkt', 'werken', 'werkt'], ['kijkt', 'kijken mee', 'kijkt mee'], ['leert', 'leren nog', 'leert nog'], ['mis', 'vul in', 'vul in'], ['uit', 'staan uit', 'staat uit'], ['nodig', 'met iets erbij', 'met iets erbij']]
        .map(([s, veel, een]) => (tel(s) ? `<span class="stand ${s}">${tel(s)} ${tel(s) === 1 ? een : veel}</span>` : ''))
        .join('')
    : '';
  return `<h2 class="kop-3">Wat je huis kan</h2><p class="mini" style="margin: 4px 0 0">Alles wat Smart Climate voor je doet, en hoe het ervoor staat.</p><div class="standen">${standen}</div>`;
}

/* --------------------------------------------------------- de groepen */

const ICOON = {
  huis: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--ijs)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  comfort: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--mint)" stroke-width="1.8" stroke-linecap="round"><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/></svg>',
  energie: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--zon)" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>',
  regeling: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--violet)" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="6" width="18" height="8" rx="2"/><path d="M7 18c0-1.5 1-2 1-3M12 19c0-1.5 1-2 1-3M17 18c0-1.5 1-2 1-3"/></svg>',
  functies: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--zacht)" stroke-width="1.8" stroke-linecap="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/></svg>',
  toegang: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--zacht)" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M10 18h4"/></svg>',
};

const euro = (v) => (v == null ? null : `€ ${nl(v, 2)}`);
const graden = (c) => `${nl(c, Number.isInteger(c) ? 0 : 1)}°`;

function feitenVan(id) {
  const kamers = (d.huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []);
  switch (id) {
    case 'huis': {
      const etages = (d.huis?.etages ?? []).filter((e) => e.id !== 'buiten' && e.ruimtes?.length).length;
      const apps = kamers.reduce((t, r) => t + r.apparaten.length, 0);
      const zonder = d.huis?.zonderRuimte?.length ?? 0;
      return [
        ['Etages en kamers', d.huis ? `${etages} etages, ${kamers.length} kamers` : '…'],
        ['Apparaten in een kamer', d.huis ? `${apps} van ${apps + zonder}` : '…'],
        ['Verborgen', d.huis ? `${d.huis.verborgen?.length ?? 0} apparaten` : '…'],
      ];
    }
    case 'comfort': {
      const k = d.comfort?.kamers ?? [];
      const zin = (x) => {
        const p = x.modi.dag;
        return p.heat != null && p.cool != null ? `${nl(p.heat, Number.isInteger(p.heat) ? 0 : 1)} tot ${graden(p.cool)}` : p.heat != null ? graden(p.heat) : p.cool != null ? `tot ${graden(p.cool)}` : 'niets';
      };
      const dd = d.comfort?.dagdelen;
      return [...k.slice(0, 2).map((x) => [`${x.naam} overdag`, zin(x)]), ['Dagdelen', dd ? `${dd.dag}:00 tot ${dd.nacht}:00` : '…']];
    }
    case 'energie': {
      const a = d.aansluiting;
      const p = d.energie?.instellingen?.prijzen;
      const panelen = a?.antwoorden?.panelen?.aantal ? `${a.antwoorden.panelen.aantal}${a.antwoorden.panelen.ligging === 'beide' ? ', twee kanten' : ''}` : (a?.configuratie?.panelen ?? []).length ? `${a.configuratie.panelen.length} vlakken` : null;
      const z = a?.antwoorden?.zekering ?? a?.configuratie?.zekering;
      return [
        ['Panelen', panelen, !a ? '…' : 'nog kiezen'],
        ['Hoofdzekering', z ? `${z.fasen} × ${z.ampere} A` : null, !a ? '…' : 'nog kiezen'],
        ['Stroomprijs', euro(p?.stroom), d.energie ? 'nog invullen' : '…'],
      ];
    }
    case 'regeling': {
      const acts = d.site?.actuators ?? [];
      const airco = acts.filter((x) => x.capabilities?.canCool).length;
      const warm = acts.filter((x) => !x.capabilities?.canCool).length;
      const opZon = Object.values(d.aansluiting?.antwoorden?.opZon ?? {}).filter(Boolean).length + (d.aansluiting?.configuratie?.apparaten?.length ?? 0);
      return [
        ["Airco's", airco ? `${airco}, kijkt mee` : 'geen'],
        ['Cv en thermostaten', warm ? `${warm}, kijkt mee` : 'geen'],
        ['Apparaten op zon', opZon ? `${opZon}` : 'geen'],
      ];
    }
    case 'functies': {
      const f = d.functies?.instellingen ?? d.functies?.voorstel;
      const weer = (d.functies?.gevonden?.weerbronnen ?? []).find((b) => b.id === f?.weer?.bron)?.naam ?? (f?.weer?.bron ? f.weer.bron : 'geen');
      return [
        ['Licht en screens', f ? (f.licht?.bedienen === false ? 'alleen kijken' : 'bedienen in de app') : '…'],
        ['Deurbel', f ? (f.deurbel?.aan ? `beeld ${f.deurbel.seconden} tellen` : 'uit') : '…'],
        ['Weer', f ? weer.replace(' (via internet)', '') : '…'],
      ];
    }
    case 'toegang': {
      const s = d.sessie;
      const ingelogd = !s ? '…' : s.toegang !== 'sessions' ? 'geen inlog nodig' : s.ingelogd ? `${s.naam ?? ''}${s.rol ? `, ${s.rol}` : ''}` : 'niet ingelogd';
      const dagen = d.export?.bestanden != null ? `${d.export.bestanden} dagen` : '…';
      return [
        ['Ingelogd', ingelogd],
        ['Je gegevens', dagen],
        ['Versie', d.health?.versie?.nummer ?? '…'],
      ];
    }
    default:
      return [];
  }
}

const GROEPEN = [
  ['huis', 'Je huis', 'Kamers, etages, sensoren'],
  ['comfort', 'Comfort', 'Temperaturen, dagdelen, vakantie'],
  ['energie', 'Energie', 'Panelen, zekering, meters, prijzen'],
  ['regeling', 'Regeling', 'Wie wat regelt, apparaten op zon'],
  ['functies', 'Functies', "Licht, screens, camera's, weer"],
  ['toegang', 'App en toegang', 'Inloggen, gegevens, versie'],
];

function groepen() {
  const mis = stand.nogTeDoen(d);
  return GROEPEN.map(([id, titel, onder]) => {
    const n = mis.filter((x) => x.groep === id).length;
    const feiten = feitenVan(id)
      .map(([naam, waarde, leeg]) => `<li>${esc(naam)}<b class="${waarde == null && leeg !== '…' ? 'leeg' : ''}">${esc(waarde ?? leeg ?? '')}</b></li>`)
      .join('');
    return `<a class="glas tegel${n ? ' aandacht' : ''}" href="${stand.GROEPEN[id]}">
      <div class="titel"><span class="icoon">${ICOON[id]}</span><h3>${esc(titel)}</h3><span class="pijl" aria-hidden="true">›</span></div>
      <ul>${feiten}</ul>
      <div class="onder"><span>${esc(onder)}</span>${n ? `<span class="stand mis">${n} mist</span>` : '<span class="stand werkt">Klaar</span>'}</div>
    </a>`;
  }).join('');
}

/* -------------------------------------------------------------- zoeken */

const ZOEKVELD = '<label class="zoek"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" data-zoek placeholder="Zoek een instelling, zoals &quot;zekering&quot;" aria-label="Zoek een instelling" autocomplete="off"></label><div class="gevonden" data-gevonden hidden></div>';

function toonGevonden(veld) {
  const vak = veld.closest('[data-zoekvak]').querySelector('[data-gevonden]');
  const lijst = stand.zoek(veld.value, d);
  vak.hidden = veld.value.trim().length < 2;
  vak.innerHTML = lijst.length ? lijst.map((z) => `<a href="${z.href}">${esc(z.titel)}<span>${esc(z.waar)}</span></a>`).join('') : '<p>Niets gevonden. Probeer een ander woord, zoals "prijs" of "deurbel".</p>';
}

/* ------------------------------------------------------------ tekenen */

function tekenNu() {
  app.schaal();
  app.luchtVan(d.zon, 0);
  const m = mist();
  $$('[data-mist]').forEach((el) => {
    el.innerHTML = m.html;
    el.classList.toggle('klaar', m.klaar);
  });
  $$('[data-kan]').forEach((el) => (el.innerHTML = kan()));
  $$('[data-groepen]').forEach((el) => (el.innerHTML = groepen()));
  // Het zoekveld één keer neerzetten: anders verdwijnt wat je typt.
  $$('[data-zoekvak]').forEach((el) => {
    if (!el.querySelector('[data-zoek]')) el.innerHTML = ZOEKVELD;
  });
}

/* -------------------------------------------------------------- starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

app.start('instellingen');
document.addEventListener('input', (e) => {
  if (e.target.matches('[data-zoek]')) toonGevonden(e.target);
});
document.addEventListener('keydown', (e) => {
  if (!e.target.matches?.('[data-zoek]')) return;
  if (e.key === 'Enter') {
    const eerste = e.target.closest('[data-zoekvak]').querySelector('[data-gevonden] a');
    if (eerste) location.href = eerste.getAttribute('href');
  } else if (e.key === 'Escape') {
    e.target.value = '';
    toonGevonden(e.target);
  }
});
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('[data-zoekvak]')) $$('[data-gevonden]').forEach((el) => (el.hidden = true));
});
void laadAlles();
setInterval(() => void laadAlles(), 5 * 60_000);
