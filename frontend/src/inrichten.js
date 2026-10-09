/*
 * Inrichten (besluit 114): de wizard. Zeven stappen langs wat er per huis
 * verschilt; elke stap ziet aan de dienst of hij al gedaan is, en opent de
 * pagina die er al is. Daar staat een balk met de volgende stap (basis.js),
 * zodat je er in één keer doorheen loopt. Niets hier schrijft zelf.
 */
'use strict';

const { $$, esc, haal } = app;

const data = { huis: null, site: null, aansluiting: null, energie: null, functies: null, zon: null };

async function laad() {
  const namen = ['huis', 'site', 'aansluiting', 'energie', 'functies', 'zon'];
  const uit = await Promise.allSettled(['api/huis', 'api/site', 'api/aansluiting', 'api/energie', 'api/functies', 'api/zon'].map((p) => haal(p)));
  uit.forEach((r, i) => {
    if (r.status === 'fulfilled') data[namen[i]] = r.value;
  });
  teken();
}

const meervoud = (n, een, veel) => `${n} ${n === 1 ? een : veel}`;

/** De hoofdzekering: gekozen in de app, anders wat de configuratie zegt (besluit 117). */
function zekeringZin(gekozen, uitConfig) {
  if (gekozen && gekozen !== 'weetniet') return `Hoofdzekering ${gekozen.fasen} × ${gekozen.ampere} A`;
  if (uitConfig) return `Hoofdzekering ${uitConfig.fasen} × ${uitConfig.ampere} A, uit de configuratie; nakijken`;
  return gekozen === 'weetniet' ? 'Hoofdzekering: weet ik niet' : 'Hoofdzekering: nog niet ingevuld';
}

/** De stappen, met wat er al is en of hij klaar is. */
function stappen() {
  const h = data.huis;
  const etages = (h?.etages ?? []).filter((e) => e.id !== 'buiten' && e.ruimtes?.length);
  const kamers = etages.reduce((t, e) => t + e.ruimtes.length, 0);
  const los = h?.zonderRuimte?.length ?? 0;
  const acts = data.site?.actuators ?? [];
  const aircos = acts.filter((a) => a.capabilities?.canCool).length;
  const zones = data.site?.zones?.length ?? 0;
  const a = data.aansluiting?.antwoorden;
  const e = data.energie?.instellingen;
  const f = data.functies?.instellingen;
  return [
    {
      id: 'welkom',
      kop: 'Welkom',
      klaar: true,
      zin: 'Smart Climate regelt het klimaat in je huis op de zon. Eerst kijkt het mee: het zegt wat het zou doen, en leert van je huis. Pas als het genoeg weet, laat je het echt regelen.',
      wat: ['Zes korte stappen, elk een paar minuten', 'Er verandert niets in Home Assistant', 'Alles is later aan te passen bij Instellingen'],
    },
    {
      id: 'huis',
      kop: 'Je huis',
      klaar: h?.indeling === 'eigen',
      zin: 'De etages en kamers, en welk apparaat waar staat. De app doet een voorstel uit Home Assistant; jij kijkt het na.',
      wat: [h ? `${meervoud(etages.length, 'etage', 'etages')}, ${meervoud(kamers, 'kamer', 'kamers')}` : 'Nog niet gelezen uit Home Assistant', los ? `${meervoud(los, 'apparaat', 'apparaten')} nog in te delen` : 'Alles heeft een plek', h?.indeling === 'eigen' ? 'Vastgelegd' : 'Nog het voorstel uit Home Assistant'],
      pagina: 'indeling.html',
    },
    {
      id: 'klimaat',
      kop: 'Klimaat',
      klaar: acts.length > 0,
      zin: 'De airco’s, warmtepompen en thermostaten die Smart Climate regelt, en per kamer de gewenste temperatuur.',
      wat: acts.length ? [`${meervoud(aircos, 'airco', 'airco’s')}${acts.length - aircos ? `, ${meervoud(acts.length - aircos, 'ander apparaat', 'andere apparaten')}` : ''}`, `${meervoud(zones, 'kamer met een regeling', 'kamers met een regeling')}`, 'Nakijken per apparaat komt in een volgende versie'] : ['Nog geen klimaatapparaten in de configuratie'],
      pagina: 'instellingen.html',
    },
    {
      id: 'zon',
      kop: 'Zon en aansluiting',
      klaar: a != null,
      zin: 'Waar je panelen liggen, je hoofdzekering, je contract, en welke apparaten op zon mogen starten.',
      wat: a ? [a.panelen?.ligging ? `Panelen: ${a.panelen.ligging === 'beide' ? 'beide kanten' : a.panelen.ligging}` : 'Panelen: nog niet ingevuld', zekeringZin(a.zekering, data.aansluiting.configuratie?.zekering)] : ['Nog niets ingevuld'],
      pagina: 'aansluiting.html',
    },
    {
      id: 'meters',
      kop: 'Meters en prijzen',
      klaar: e != null && e.prijzen?.stroom != null,
      zin: 'Welke meters Opbrengst gebruikt, en wat stroom en gas kosten, zoals op je contract.',
      wat: e ? [`${meervoud(e.net?.afname?.length ?? 0, 'meter', 'meters')} van het net${e.zon?.length ? ', zonnepanelen' : ''}${e.gas ? ', gas' : ''}`, e.prijzen?.stroom != null ? (e.prijzen.stroomDal != null ? 'Normaal en dal' : 'Eén tarief') : 'Prijzen nog niet ingevuld', `${meervoud(e.prijzen?.vast?.length ?? 0, 'vaste post', 'vaste posten')}`] : ['Nog niets ingesteld'],
      pagina: 'meters.html',
    },
    {
      id: 'functies',
      kop: 'Functies',
      klaar: f != null,
      zin: 'Welke camera’s de app toont, de deurbel, licht bedienen, en waar het weer vandaan komt.',
      wat: f ? [`${meervoud(f.cameras?.aan ? f.cameras.lijst.length : 0, 'camera', 'camera’s')}`, f.deurbel?.aan ? 'Deurbel aan' : 'Geen deurbel', f.weer?.bron ? `Weer: ${f.weer.bron === 'buienradar' ? 'Buienradar' : 'weerdienst'}` : 'Geen weer'] : ['Het voorstel uit Home Assistant staat aan; kijk het na en sla op'],
      pagina: 'functies.html',
    },
    {
      id: 'klaar',
      kop: 'Klaar',
      klaar: false,
      zin: 'Smart Climate kijkt nu mee. Op Thuis zie je wat het huis doet en zou doen; bij Instellingen zie je hoeveel het al weet. Echt regelen komt pas als er genoeg bewijs is.',
      wat: [],
      pagina: 'thuis.html',
    },
  ];
}

function gekozen(lijst) {
  const id = decodeURIComponent(location.hash.slice(1));
  return lijst.find((s) => s.id === id) ?? lijst.find((s) => !s.klaar && s.id !== 'welkom') ?? lijst[0];
}

function tekenNu() {
  app.schaal();
  app.luchtVan(data.zon, 0);
  const lijst = stappen();
  const nu = gekozen(lijst);
  const te = lijst.filter((s) => s.id !== 'welkom' && s.id !== 'klaar');
  const gedaan = te.filter((s) => s.klaar).length;
  $$('[data-voortgang]').forEach((el) => (el.textContent = `${gedaan} van ${te.length} stappen klaar`));
  $$('[data-stappen]').forEach((el) => {
    el.innerHTML = lijst
      .map((s, i) => `<a class="stapknop${s.id === nu.id ? ' nu' : ''}" href="#${s.id}" aria-current="${s.id === nu.id ? 'step' : 'false'}"><span class="nummer ${s.klaar && s.id !== 'klaar' ? 'klaar' : ''}">${s.klaar && s.id !== 'welkom' && s.id !== 'klaar' ? '✓' : i + 1}</span><span class="l"><b>${esc(s.kop)}</b><span>${s.id === 'welkom' || s.id === 'klaar' ? '' : s.klaar ? 'klaar' : 'nog te doen'}</span></span></a>`)
      .join('');
  });
  const i = lijst.indexOf(nu);
  const volgende = lijst[i + 1];
  const knoppen = nu.id === 'klaar'
    ? '<a class="knop knop-licht" href="thuis.html">Naar Thuis</a>'
    : `${nu.pagina ? `<a class="knop knop-licht" href="${nu.pagina}?inrichten=${nu.id}">${nu.klaar ? 'Nakijken' : 'Instellen'}</a>` : ''}${volgende ? `<a class="knop" href="#${volgende.id}">${nu.pagina ? 'Overslaan' : 'Beginnen'}</a>` : ''}`;
  $$('[data-stapblad]').forEach((el) => {
    el.innerHTML = `<span class="mini">Stap ${i + 1} van ${lijst.length}</span>
      <h2 class="kop-1" style="font-size: 36px; margin: 4px 0 0">${esc(nu.kop)}</h2>
      <p class="lead" style="margin: 10px 0 0; max-width: 60ch">${esc(nu.zin)}</p>
      ${nu.wat.length ? `<ul class="wat">${nu.wat.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      <div class="knoppenrij">${knoppen}</div>`;
  });
}

const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
addEventListener('hashchange', teken);

app.start('instellingen');
void laad();
