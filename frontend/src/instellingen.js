/*
 * Instellingen (besluit 130, schets Wand-Instellingen). Achter het tandwiel:
 * wat er nog mist, Wat je huis kan, en acht groepen die je herkent aan wat ze
 * regelen. Elke groep toont zijn belangrijkste waarden en of er iets mist.
 * Bedienen doe je in het huis; hier stel je in.
 */
'use strict';

const { $$, nl, esc, haal } = app;

/** Alles wat de pagina leest, per deur; null zolang die niets gaf. */
const d = { energie: null, aansluiting: null, huis: null, functies: null, comfort: null, site: null, sessie: null, export: null, health: null, zon: null, bewoners: null, divergence: null, sluip: null };

async function laadAlles() {
  const deuren = { energie: 'api/energie', aansluiting: 'api/aansluiting', huis: 'api/huis', functies: 'api/functies', comfort: 'api/comfort', site: 'api/site', sessie: 'api/sessie', export: 'api/export/info', health: 'api/health', zon: 'api/zon', bewoners: 'api/bewoners', divergence: 'api/divergence', sluip: 'api/sluipverbruik' };
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
    return { klaar: true, html: `<h2 class="kop-3">${esc(t('instellingen.allesGoed'))}</h2><p class="mini" style="margin: 2px 0 0">${esc(t('instellingen.allesGoedZin'))}</p>` };
  }
  const rijen = lijst.slice(0, 3).map((x) => `<div class="regel"><div><b>${esc(x.wat)}</b><span>${esc(x.waarom)}</span></div><a class="doe" href="${x.href}">${esc(x.knop)}</a></div>`).join('');
  return { klaar: false, html: `<h2 class="kop-3"><span class="stip" style="background: var(--gloed)"></span>${esc(t('instellingen.nogTeDoen'))}</h2>${rijen}${lijst.length > 3 ? `<p class="mini" style="margin: 6px 0 0">${esc(t('instellingen.enNog', { n: lijst.length - 3 }))}</p>` : ''}` };
}

function kan() {
  const k = window.stand.kan ? stand.kan(d) : null;
  const tel = (s) => (k ? k.filter((x) => x.stand === s).length : 0);
  const standen = k
    ? ['werkt', 'kijkt', 'leert', 'mis', 'uit', 'nodig']
        .map((s) => (tel(s) ? `<span class="stand ${s}">${esc(t(`instellingen.telt.${s}`, { n: tel(s) }))}</span>` : ''))
        .join('')
    : '';
  // De kleine zonnewaaier: een tik erop opent meteen Hoe ver je huis is.
  const v = k && window.waaier ? stand.voortgang(d) : null;
  const mini = v?.onderwerpen.length ? `<span class="kanwaaier" data-naar="voortgang.html" title="${esc(t('voortgang.open'))}"><svg viewBox="0 0 190 110" aria-hidden="true" data-mini></svg></span>` : '';
  return `<div><h2 class="kop-3">${esc(t('instellingen.kan'))}</h2><p class="mini" style="margin: 4px 0 0">${esc(t('instellingen.kanZin'))}</p><div class="standen">${standen}</div></div>${mini}`;
}

/* --------------------------------------------------------- de groepen */

const ICOON = {
  huis: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--ijs)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  comfort: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--mint)" stroke-width="1.8" stroke-linecap="round"><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/></svg>',
  energie: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--zon)" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>',
  regeling: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--violet)" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="6" width="18" height="8" rx="2"/><path d="M7 18c0-1.5 1-2 1-3M12 19c0-1.5 1-2 1-3M17 18c0-1.5 1-2 1-3"/></svg>',
  functies: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--zacht)" stroke-width="1.8" stroke-linecap="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/></svg>',
  // Inrichten (0.90.1): een pad met stappen.
  inrichten: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--mint)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6"/></svg>',
  // De assistent (besluit 217): een spraakwolk.
  assistent: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--violet)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/></svg>',
  toegang: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--zacht)" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M10 18h4"/></svg>',
};

const euro = (v) => (v == null ? null : `€ ${nl(v, 2)}`);
const getal = (c) => nl(c, Number.isInteger(c) ? 0 : 1);
const graden = (c) => `${getal(c)}°`;

function feitenVan(id) {
  const kamers = (d.huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []);
  switch (id) {
    case 'huis': {
      const etages = (d.huis?.etages ?? []).filter((e) => e.id !== 'buiten' && e.ruimtes?.length).length;
      const apps = kamers.reduce((n, r) => n + r.apparaten.length, 0);
      const zonder = d.huis?.zonderRuimte?.length ?? 0;
      return [
        [t('instellingen.etagesKamers'), d.huis ? `${t('instellingen.etages', { n: etages })}, ${t('instellingen.kamers', { n: kamers.length })}` : '…'],
        [t('instellingen.inKamer'), d.huis ? t('instellingen.vanTotaal', { a: apps, b: apps + zonder }) : '…'],
        [t('instellingen.verborgen'), d.huis ? t('instellingen.apparaten', { n: d.huis.verborgen?.length ?? 0 }) : '…'],
      ];
    }
    case 'comfort': {
      const k = d.comfort?.kamers ?? [];
      const zin = (x) => {
        const p = x.modi.dag;
        return p.heat != null && p.cool != null ? t('instellingen.van', { van: getal(p.heat), tot: graden(p.cool) }) : p.heat != null ? graden(p.heat) : p.cool != null ? t('instellingen.tot', { tot: graden(p.cool) }) : t('instellingen.niets');
      };
      const dd = d.comfort?.dagdelen;
      return [...k.slice(0, 2).map((x) => [t('instellingen.overdag', { naam: x.naam }), zin(x)]), [t('instellingen.dagdelen'), dd ? t('instellingen.van', { van: `${dd.dag}:00`, tot: `${dd.nacht}:00` }) : '…']];
    }
    case 'energie': {
      const a = d.aansluiting;
      const p = d.energie?.instellingen?.prijzen;
      const aantal = a?.antwoorden?.panelen?.aantal;
      // Een ligging die je bij Inrichten bevestigde, telt ook (30 oktober 2026: "Klopt" gaf hier toch "nog kiezen").
      const lig = ['bevestigd', 'configuratie'].includes(a?.ligging?.stand) ? a.ligging.nu : null;
      const panelen = aantal ? (a.antwoorden.panelen.ligging === 'beide' ? t('instellingen.tweeKanten', { n: aantal }) : `${aantal}`) : (a?.configuratie?.panelen ?? []).length ? t('instellingen.vlakken', { n: a.configuratie.panelen.length }) : lig ? (lig.vermogenKort ?? lig.vermogen ?? lig.richting ?? null) : null;
      const z = a?.antwoorden?.zekering ?? a?.configuratie?.zekering;
      return [
        [t('instellingen.panelen'), panelen, !a ? '…' : t('instellingen.nogKiezen')],
        [t('instellingen.zekering'), z ? `${z.fasen} × ${z.ampere} A` : null, !a ? '…' : t('instellingen.nogKiezen')],
        [t('instellingen.stroomprijs'), euro(p?.stroom), d.energie ? t('instellingen.nogInvullen') : '…'],
      ];
    }
    case 'regeling': {
      const acts = d.site?.actuators ?? [];
      const airco = acts.filter((x) => x.capabilities?.canCool).length;
      const warm = acts.filter((x) => !x.capabilities?.canCool).length;
      const opZon = Object.values(d.aansluiting?.antwoorden?.opZon ?? {}).filter(Boolean).length + (d.aansluiting?.configuratie?.apparaten?.length ?? 0);
      return [
        [t('instellingen.aircos'), airco ? t('instellingen.kijktMee', { n: airco }) : t('instellingen.geen')],
        [t('instellingen.cv'), warm ? t('instellingen.kijktMee', { n: warm }) : t('instellingen.geen')],
        [t('instellingen.opZon'), opZon ? `${opZon}` : t('instellingen.geen')],
      ];
    }
    case 'functies': {
      const f = d.functies?.instellingen ?? d.functies?.voorstel;
      const weer = (d.functies?.gevonden?.weerbronnen ?? []).find((b) => b.id === f?.weer?.bron)?.naam ?? (f?.weer?.bron ? f.weer.bron : t('instellingen.geen'));
      const duur = (s) => (s >= 60 ? t('algemeen.minuten', { n: s / 60 }) : t('instellingen.seconden', { n: s }));
      return [
        [t('instellingen.licht'), f ? t(f.licht?.bedienen === false ? 'instellingen.alleenKijken' : 'instellingen.bedienen') : '…'],
        [t('instellingen.deurbel'), f ? (f.deurbel?.aan ? t('instellingen.beeld', { duur: duur(f.deurbel.seconden) }) : t('instellingen.uit')) : '…'],
        [t('instellingen.weer'), f ? weer.replace(' (via internet)', '') : '…'],
      ];
    }
    case 'assistent': {
      const f = d.functies?.instellingen ?? d.functies?.voorstel;
      const aanUit = (x) => t(x ? 'instellingen.aan' : 'instellingen.uit');
      return [
        [t('instellingen.praten'), f ? t(f.praten?.taalmodel ? 'functies.deel.eigen' : 'functies.deel.vast') : '…'],
        [t('instellingen.bedienenZin'), f ? aanUit(f.praten?.bedienen !== false) : '…'],
        [t('nav.tedoen'), f ? aanUit(f.tedoen?.aan === true) : '…'],
      ];
    }
    case 'inrichten': {
      const n = nagelopen();
      return [
        [t('instellingen.inr.wat'), t('instellingen.inr.watWaarde')],
        [t('instellingen.inr.nagelopen'), n ? t('instellingen.inr.nStappen', { n }) : t('instellingen.inr.nogNiet')],
      ];
    }
    case 'toegang': {
      const s = d.sessie;
      const ingelogd = !s ? '…' : s.toegang === 'open' ? t('instellingen.geenInlog') : s.ingelogd ? `${s.naam ?? ''}${s.rol ? `, ${s.rol}` : ''}` : t('instellingen.nogNiet');
      // Bewoners (besluit 147): wie hier woont, de hoofdgebruiker eerst.
      const namen = d.bewoners ? d.bewoners.bewoners.map((b) => b.naam).join(', ') || t('instellingen.nogNiemand') : '…';
      return [
        [t('instellingen.bewoners'), namen],
        [t('instellingen.inloggen'), ingelogd],
        [t('instellingen.versie'), d.health?.versie?.nummer ?? '…'],
      ];
    }
    default:
      return [];
  }
}

/** Hoeveel stappen van Inrichten op dit apparaat al nagelopen zijn (inrichten.js bewaart ze zo). */
function nagelopen() {
  try {
    return JSON.parse(localStorage.getItem('sc-inrichten-bevestigd') ?? '[]').filter((x) => x !== 'welkom').length;
  } catch {
    return 0;
  }
}

// Inrichten als achtste tegel (0.90.1): op de wand twee rijen van vier, op de telefoon onderaan de lijst. Eerst stond hij als knop bovenin.
const GROEPEN = ['huis', 'comfort', 'energie', 'regeling', 'functies', 'assistent', 'toegang', 'inrichten'];

function groepen() {
  const mis = isGast() ? [] : stand.nogTeDoen(d);
  return GROEPEN.map((id) => [id, t(`groep.${id}`), t(`groep.${id}Zin`)]).filter(([id]) => !isGast() || id === 'toegang').map(([id, titel, onder]) => {
    const n = mis.filter((x) => x.groep === id).length;
    const feiten = feitenVan(id)
      .map(([naam, waarde, leeg]) => `<li>${esc(naam)}<b class="${waarde == null && leeg !== '…' ? 'leeg' : ''}">${esc(waarde ?? leeg ?? '')}</b></li>`)
      .join('');
    return `<a class="glas tegel${n ? ' aandacht' : ''}" href="${stand.GROEPEN[id]}">
      <div class="titel"><span class="icoon">${ICOON[id]}</span><h3>${esc(titel)}</h3><span class="pijl" aria-hidden="true">›</span></div>
      <ul>${feiten}</ul>
      <div class="onder"><span>${esc(onder)}</span>${
        // Inrichten is geen groep die klaar is of iets mist: beginnen, of verder waar je was.
        id === 'inrichten'
          ? `<span class="stand kijkt">${esc(t(nagelopen() ? 'instellingen.inr.verder' : 'instellingen.inr.begin'))}</span>`
          : n
            ? `<span class="stand mis">${esc(t('instellingen.mist', { n }))}</span>`
            : // Wat klaar is, zegt niets extra (besluit 227): alleen wat mist krijgt een pil.
              ''
      }</div>
    </a>`;
  }).join('');
}

/* -------------------------------------------------------------- zoeken */

const ZOEKVELD = `<label class="zoek"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" data-zoek placeholder="${esc(t('instellingen.zoek'))}" aria-label="${esc(t('instellingen.zoekLabel'))}" autocomplete="off"></label><div class="gevonden" data-gevonden hidden></div>`;

function toonGevonden(veld) {
  const vak = veld.closest('[data-zoekvak]').querySelector('[data-gevonden]');
  const lijst = stand.zoek(veld.value, d);
  vak.hidden = veld.value.trim().length < 2;
  vak.innerHTML = lijst.length ? lijst.map((z) => `<a href="${z.href}">${esc(z.titel)}<span>${esc(z.waar)}</span></a>`).join('') : `<p>${esc(t('instellingen.nietsGevonden'))}</p>`;
}

/* ------------------------------------------------------------ tekenen */

/** Een gast (besluit 151): kijkt mee, en verandert geen instellingen. */
const isGast = () => d.bewoners?.ik?.soort === 'gast';
const GAST = `<h2 class="kop-3">${esc(t('instellingen.gast'))}</h2><p class="mini" style="margin: 2px 0 0">${esc(t('instellingen.gastZin'))}</p>`;

function tekenNu() {
  app.schaal();
  app.luchtVan(d.zon, 0);
  const m = isGast() ? { klaar: true, html: GAST } : mist();
  // Inrichten en zoeken leiden een gast alleen naar pagina's die hij niet kan gebruiken.
  // Met hidden en niet met style.display: dat wiste het centreren van de knop Inrichten.
  $$('a[href="inrichten.html"], [data-zoekvak]').forEach((el) => (el.hidden = isGast()));
  $$('[data-mist]').forEach((el) => {
    el.innerHTML = m.html;
    el.classList.toggle('klaar', m.klaar);
  });
  $$('[data-kan]').forEach((el) => (el.innerHTML = kan()));
  const v = $$('[data-mini]').length ? stand.voortgang(d) : null;
  $$('[data-mini]').forEach((svg) => waaier.teken(svg, { groepen: v.groepen, cx: 95, cy: 104, r0: 32, R: 92, getal: `${v.totaal}%`, groei: false, knoppen: false }));
  $$('[data-groepen]').forEach((el) => (el.innerHTML = groepen()));
  // Jij (besluit 181): je profiel; een gast heeft er geen, een scherm alleen hoe de app eruitziet.
  const ik = d.bewoners?.ik ?? null;
  const naam = ik?.soort === 'bewoner' && ik.naam ? ik.naam : t(ik?.soort === 'scherm' ? 'jij.ditScherm' : 'jij.kop');
  const letter = ik?.soort === 'bewoner' && ik.naam ? `<span class="jijrondje" aria-hidden="true">${esc(ik.naam.charAt(0).toUpperCase())}</span>` : '';
  const onder = t(ik?.soort === 'bewoner' ? 'instellingen.jijBewoner' : 'instellingen.jijScherm');
  $$('[data-jijregel]').forEach((el) => {
    el.hidden = isGast();
    el.innerHTML = `${letter}<span><b>${esc(naam)}</b><span>${esc(onder)}</span></span><span class="pijl" aria-hidden="true">›</span>`;
  });
  $$('[data-jijpil]').forEach((el) => {
    el.hidden = isGast() || ik?.soort !== 'bewoner';
    el.innerHTML = `${letter}${esc(naam)}`;
  });
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
document.addEventListener('click', (e) => {
  const naar = e.target.closest('[data-naar]');
  if (!naar) return;
  e.preventDefault();
  location.href = naar.dataset.naar;
});
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('[data-zoekvak]')) $$('[data-gevonden]').forEach((el) => (el.hidden = true));
});
void laadAlles();
setInterval(() => void laadAlles(), 5 * 60_000);
