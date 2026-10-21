/*
 * Bewoners en toegang (besluit 130 en 147): wie hier woont en wie jij bent,
 * de sleutel voor de assistent van Home Assistant, je gegevens, en welke
 * versie er draait. Bij je gegevens een back-up, terugzetten, het logboek voor
 * de analyse en opnieuw beginnen, alleen voor de hoofdgebruiker (besluit 151).
 * Een gast ziet alleen wie hij is en de versie.
 *
 * Inloggen is geen eigen deel meer (besluit 167): wie je bent staat bovenaan
 * Bewoners, met Uitloggen als de app niet via Home Assistant draait. Dit
 * scherm (volledig scherm) staat bij Functies, onder Weergave.
 */
'use strict';

const { $$, nl, esc, haal } = app;

let sessie = null;
let gegevens = null;
let health = null;
let zon = null;
let bewoners = null;
let sleutel = null;
/** Waar de assistent van Home Assistant zijn vraag stelt (besluit 177). */
let vraagAdres = null;
/** Wat /api/gegevens zegt (besluit 151): of je de hoofdgebruiker bent, het logboek, de back-ups. */
let opslag = null;
/** Wat er gevraagd wordt: null, 'opnieuw', of { backup, naam } om terug te zetten. */
let bevestig = null;
/** Een melding bij je gegevens, zoals "Smart Climate start opnieuw". */
let melding = null;

async function laadAlles() {
  const [s, g, h, z, b, k, o] = await Promise.allSettled([haal('api/sessie'), haal('api/export/info'), haal('api/versie'), haal('api/zon'), haal('api/bewoners'), fetch('api/sleutel', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)), haal('api/gegevens')]);
  if (o.status === 'fulfilled') opslag = o.value;
  if (s.status === 'fulfilled') sessie = s.value;
  if (b.status === 'fulfilled') bewoners = b.value;
  if (k.status === 'fulfilled') {
    sleutel = k.value?.sleutel ?? null;
    vraagAdres = k.value?.adres ?? null;
  }
  if (g.status === 'fulfilled') gegevens = g.value;
  if (h.status === 'fulfilled') health = h.value;
  if (z.status === 'fulfilled') zon = z.value;
  teken();
}

const isGast = () => bewoners?.ik?.soort === 'gast';

function delen() {
  const inlog = !sessie ? '…' : sessie.toegang === 'open' ? 'geen inlog nodig' : sessie.ingelogd ? `${sessie.naam ?? 'ingelogd'}${sessie.rol ? `, ${sessie.rol}` : ''}` : 'niet ingelogd';
  const namen = bewoners ? bewoners.bewoners.map((b) => b.naam).join(', ') || 'nog niemand' : '…';
  // Een gast (besluit 151): alleen wie hij is en de versie; instellingen veranderen kan hij niet.
  if (isGast()) {
    return [
      { id: 'bewoners', titel: 'Jij', zin: inlog, stand: sessie ? 'goed' : null },
      { id: 'versie', titel: 'Versie', zin: health?.nummer ? `${health.nummer}, wat is er nieuw` : '…', stand: health ? 'goed' : null },
    ];
  }
  return [
    { id: 'bewoners', titel: 'Bewoners', zin: namen, stand: bewoners ? 'goed' : null },
    ...(sleutel ? [{ id: 'assistent', titel: 'Sleutel voor de assistent', zin: 'voor Home Assistant', stand: 'goed' }] : []),
    { id: 'gegevens', titel: 'Je gegevens', zin: gegevens?.bestanden != null ? `${gegevens.bestanden} dagen bewaard` : '…', stand: gegevens ? 'goed' : null },
    { id: 'versie', titel: 'Versie', zin: health?.nummer ? `${health.nummer}, wat is er nieuw` : '…', stand: health ? 'goed' : null },
  ];
}

/**
 * Wie je bent (besluit 167, eerst het deel Inloggen): je naam en wat je mag.
 * Uitloggen alleen als de app zelf om de inlog vraagt; via Home Assistant log
 * je daar uit.
 */
function wieVorm() {
  const s = sessie;
  if (!s) return '';
  if (s.toegang === 'open') return '<p class="klein" style="margin: 0">Deze weergave vraagt geen inlog: wie hem kan openen, kan ook bedienen.</p>';
  const rol = s.rol ? `, ${esc(s.rol)}` : '';
  if (s.toegang === 'ingress') return `<p class="klein" style="margin: 0">Je bent <b>${esc(s.naam ?? '')}</b>${rol}, ingelogd via Home Assistant.</p>`;
  const terug = encodeURIComponent(location.pathname);
  return s.ingelogd
    ? `<div class="knoppenrij" style="align-items: center"><p class="klein" style="margin: 0; flex: 1">Je bent <b>${esc(s.naam ?? '')}</b>${rol}.</p><button type="button" class="knop" data-uitloggen>Uitloggen</button></div>`
    : `<div class="knoppenrij" style="align-items: center"><p class="klein" style="margin: 0; flex: 1">Niet ingelogd.</p><a class="knop knop-licht" href="auth/login?terug=${terug}" style="display: inline-flex; align-items: center; text-decoration: none">Inloggen</a></div>`;
}

/** Bewoners (besluit 147): wie jij bent, kort wie hier woont, en de weg naar de pagina. */
function bewonersVorm() {
  const b = bewoners;
  if (isGast()) return `<h2 class="kop-2">Jij</h2>${wieVorm()}<p class="mini" style="margin: 0">Als gast bedien je licht en screens. Instellingen veranderen kan een bewoner.</p>`;
  if (!b) return '<h2 class="kop-2">Bewoners</h2><p class="klein" style="margin: 0">Even laden…</p>';
  const rijen = b.bewoners.map((x) => `<div class="rij-b">${esc(x.naam)}${x.ik ? ' (jij)' : ''}<span>${x.hoofd ? 'hoofdgebruiker' : x.comfort === 'eigen' ? 'eigen comfort' : 'volgt de hoofdgebruiker'}${x.thuis == null ? '' : x.thuis ? ', thuis' : ', weg'}</span></div>`).join('');
  return `<h2 class="kop-2">Bewoners</h2>
    ${wieVorm()}
    <p class="mini" style="margin: 0">Een bewoner bedient licht, screens en zijn comfort. Een beheerder in Home Assistant stelt ook je huis, je energie en de functies in.</p>
    <p class="klein" style="margin: 0">Wie hier woont, op volgorde. De eerste die thuis is, bepaalt het comfort. Iemand erbij: laat diegene één keer inloggen.</p>
    <div>${rijen || '<p class="klein" style="margin: 0">Nog niemand.</p>'}</div>
    <a class="knop knop-licht" href="bewoners.html" style="align-self: start; display: inline-flex; align-items: center; text-decoration: none">Naar Bewoners</a>`;
}

/** De sleutel voor de assistent van Home Assistant (besluit 147), alleen voor een beheerder. */
function assistentVorm() {
  return `<h2 class="kop-2">Sleutel voor de assistent</h2>
    <p class="klein" style="margin: 0">De assistent in Home Assistant stelt zijn vragen zonder dat er iemand inlogt. Daarvoor heeft hij deze sleutel nodig.</p>
    <p class="klein" style="margin: 0">Zet deze regel in Home Assistant in secrets.yaml:</p>
    <div class="sleutel" data-sleutel>smart_climate_sleutel: "Bearer ${esc(sleutel ?? '')}"</div>
    ${vraagAdres ? `<p class="klein" style="margin: 0">En bij <code>rest_command</code> in configuration.yaml dit adres, met de rest zoals in ha-assist in de handleiding:</p>
    <div class="sleutel" data-vraagadres>url: "${esc(vraagAdres)}?taal=nl&amp;v={{ v }}&amp;kamer={{ kamer | default('') | urlencode }}&amp;wens={{ wens | default('') }}&amp;temperatuur={{ temperatuur | default('') }}"</div>` : ''}
    <p class="mini" style="margin: 0">Deel de sleutel met niemand anders.</p>`;
}

const linkKnop = (href, tekst, extra = '') => `<a class="knop knop-licht" href="${href}" ${extra} style="align-self: start; display: inline-flex; align-items: center; text-decoration: none">${tekst}</a>`;
/** "smart-climate-back-up-2026-10-17-08-00-00.json" wordt een datum en tijd. */
function wanneerBackup(naam) {
  const m = /(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/.exec(naam ?? '');
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toLocaleString('nl-NL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function gegevensVorm() {
  const g = gegevens;
  const mb = g?.bytes != null ? nl(g.bytes / 1_000_000, 0) : null;
  const logboek = `<h2 class="kop-2">Je gegevens</h2>
    <p class="klein" style="margin: 0">Wat het huis meet en besluit, blijft bij jou thuis, op de plek waar Smart Climate draait: één bestand per dag. Alles wordt bewaard${g?.bestanden != null ? `, nu ${g.bestanden} dagen${mb ? ` en samen ${mb} MB` : ''}` : ''}. Per jaar komt er ongeveer 60 MB bij.</p>
    <p class="mini" style="margin: 0">Er gaat niets naar buiten. Alleen het weer vraagt de dienst op bij Open-Meteo, met je ligging op ongeveer tien kilometer.</p>`;
  if (melding) return `${logboek}<p class="klein" style="margin: 0" data-melding>${esc(melding)}</p>`;
  if (!opslag) return logboek;
  if (!opslag.hoofd) return `${logboek}<p class="klein" style="margin: 0">Een back-up maken of terugzetten, het logboek downloaden en opnieuw beginnen kan alleen de hoofdgebruiker.</p>`;

  if (bevestig === 'opnieuw') {
    return `${logboek}
      <h3 class="kop-3" style="margin: 6px 0 0">Opnieuw beginnen?</h3>
      <p class="klein" style="margin: 0">Alles wat je instelde, wat het huis leerde en het logboek gaan weg. ${opslag.configWeg ? 'Daarna richt je het huis opnieuw in.' : 'De configuratie van het huis blijft staan.'} Eerst komt er een back-up, op dit apparaat en bij Smart Climate.</p>
      <span class="fout" data-fout></span>
      <div class="knoppenrij"><button type="button" class="knop" data-toch-niet>Toch niet</button><button type="button" class="knop gevaar" data-ja-opnieuw>Ja, begin opnieuw</button></div>`;
  }
  if (bevestig?.backup) {
    const b = bevestig.backup;
    const wanneer = b.gemaakt ? new Date(b.gemaakt).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
    return `${logboek}
      <h3 class="kop-3" style="margin: 6px 0 0">Deze back-up terugzetten?</h3>
      <p class="klein" style="margin: 0">${esc(bevestig.naam)}${wanneer ? `, gemaakt op ${esc(wanneer)}` : ''}${b.app ? ` met versie ${esc(b.app)}` : ''}. Wat er nu staat, gaat eerst in een back-up bij Smart Climate. Daarna start Smart Climate opnieuw.</p>
      <span class="fout" data-fout></span>
      <div class="knoppenrij"><button type="button" class="knop" data-toch-niet>Toch niet</button><button type="button" class="knop knop-licht" data-ja-terug>Terugzetten</button></div>`;
  }
  const laatste = wanneerBackup(opslag.backups?.[0]);
  return `${logboek}
    <h3 class="kop-3" style="margin: 6px 0 0">Back-up</h3>
    <p class="klein" style="margin: 0">Je instellingen en wat het huis leerde, in één klein bestand. Het logboek zit er niet in.${laatste ? ` De laatste back-up bij Smart Climate is van ${esc(laatste)}.` : ''}</p>
    <div class="knoppenrij">${linkKnop('api/back-up', 'Back-up downloaden', 'download')}<button type="button" class="knop" data-kies-backup>Back-up terugzetten</button></div>
    <input type="file" accept=".json,application/json" data-backup-bestand hidden>
    <span class="fout" data-fout></span>
    ${g?.bestanden ? `<h3 class="kop-3" style="margin: 6px 0 0">Logboek voor onderzoek</h3>
    <p class="klein" style="margin: 0">Het logboek met je instellingen en apparaten, zonder namen van bewoners en zonder ligging. Om uit te zoeken hoe Smart Climate beter kan.</p>
    ${linkKnop('api/export', 'Logboek downloaden', 'download')}` : ''}
    <h3 class="kop-3" style="margin: 6px 0 0">Opnieuw beginnen</h3>
    <p class="klein" style="margin: 0">Een leeg huis: alles wat je instelde, leerde en vastlegde gaat weg. Eerst komt er een back-up.</p>
    <button type="button" class="knop gevaar" data-opnieuw style="align-self: start">Opnieuw beginnen</button>`;
}

/**
 * Wacht tot Smart Climate weer antwoordt na opnieuw starten, en laadt dan de
 * pagina; zonder `naar` deze pagina opnieuw. Naar dezelfde pagina met een #
 * springen laadt niets: dan bleef "start opnieuw…" staan met de oude stand.
 */
async function wachtOpHerstart(naar) {
  const begin = Date.now();
  await new Promise((ok) => setTimeout(ok, 4000));
  while (Date.now() - begin < 120_000) {
    try {
      const r = await fetch('api/health', { cache: 'no-store' });
      if (r.ok) {
        if (naar) location.href = naar;
        else location.reload();
        return;
      }
    } catch {
      // Nog niet terug.
    }
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  melding = 'Smart Climate antwoordt nog niet. Kijk over een paar minuten opnieuw.';
  teken();
}

/** Een bestand op dit apparaat bewaren, zoals de downloadknop doet. */
async function bewaarOpApparaat(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('De back-up lukte niet');
  const naam = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? 'smart-climate-back-up.json';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await r.blob());
  a.download = naam;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

async function stuurGegevens(pad, body) {
  const r = await fetch(pad, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const uit = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(uit.fout ? uit.fout.charAt(0).toUpperCase() + uit.fout.slice(1) : 'Dat lukte niet');
  return uit;
}

function zegFout(tekst) {
  $$('[data-fout]').forEach((el) => (el.textContent = tekst));
}

/** De versie en wat er nieuw is (besluit 131). */
function versieVorm() {
  const v = health;
  if (!v?.nummer) return '<h2 class="kop-2">Versie</h2><p class="klein" style="margin: 0">Onbekend.</p>';
  const gebouwd = v.gebouwd ? new Date(v.gebouwd).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const dag = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
  // De nieuwste open, de rest ingeklapt, hooguit tien terug; per versie nieuw, beter en opgelost (besluit 133).
  const SOORTEN = [['nieuw', 'Nieuw'], ['beter', 'Beter'], ['opgelost', 'Opgelost']];
  const inhoud = (n) => SOORTEN.filter(([k]) => (n[k] ?? []).length).map(([k, t]) => `<div class="soort ${k}"><span class="label">${t}</span><ul>${n[k].map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('');
  const kort = (n) => SOORTEN.filter(([k]) => (n[k] ?? []).length).map(([k, t]) => `${n[k].length} ${t.toLowerCase()}`).join(', ');
  const nieuw = (v.nieuw ?? []).slice(0, 10).map((n, i) => `<details class="nieuw"${i === 0 ? ' open' : ''}><summary><b>Versie ${esc(n.versie)}</b><span class="mini">${esc(dag(n.datum))}${i === 0 || !kort(n) ? '' : ` · ${esc(kort(n))}`}</span></summary>${inhoud(n)}</details>`).join('');
  const komt = v.installatie === 'add-on'
    ? 'Een nieuwe versie zie je in Home Assistant, bij Add-ons. Daar werk je hem bij.'
    : 'Een nieuwe versie komt op de server waar Smart Climate draait. Werkt die vanzelf bij, dan hoef je niets te doen.';
  return `<h2 class="kop-2">Versie ${esc(v.nummer)}</h2>
    <p class="klein" style="margin: 0">${gebouwd ? `Gebouwd op ${esc(gebouwd)}. ` : ''}${esc(komt)}</p>
    ${nieuw ? `<h3 class="kop-3" style="margin: 6px 0 0">Wat is er nieuw</h3>${nieuw}` : ''}
    <p class="mini" style="margin: 0">Bouw ${esc(v.commit)}</p>`;
}

const NAAST = {
  bewoners: ['Waarom bewoners', ['Het comfort van wie thuis is, geldt', 'Het huis begroet je met je naam', 'Wat je tikt, telt voor jouw comfort', 'De hele app vraagt een inlog: zo weet het huis wie er kijkt']],
  assistent: ['Waarom een sleutel', ['De assistent vraagt zonder mens erachter', 'Alleen met de sleutel komt hij binnen', 'Alleen een beheerder ziet hem']],
  gegevens: ['Waarvoor je gegevens zijn', ['Terugkijken bij Vandaag en Opbrengst', 'Het bewijs dat het huis het goed zou doen, voordat het zelf regelt', 'Later: het thermisch model, dat leert hoe elke kamer opwarmt', 'Een back-up is klein: zet hem op een stick of in je mail']],
  versie: ['Hoe de nummers werken', ['Het derde getal gaat omhoog bij een reparatie', 'Het tweede bij iets nieuws', 'Versie 1.0 is de dag dat het huis zelf regelt', 'Elke versie wordt eerst getest']],
};

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  const nu = groep.tekenDelen(delen());
  const vorm = { bewoners: bewonersVorm, assistent: assistentVorm, gegevens: gegevensVorm, versie: versieVorm }[nu]?.() ?? '';
  $$('[data-vorm]').forEach((el) => (el.innerHTML = vorm));
  const [kopje, lijst] = NAAST[nu] ?? NAAST.bewoners;
  $$('[data-naast]').forEach((el) => (el.innerHTML = `<div class="glas"><h3>${esc(kopje)}</h3><ul>${lijst.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`));
}

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
addEventListener('hashchange', teken);

app.start('instellingen');
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  try {
    if (t.hasAttribute('data-uitloggen')) {

      await fetch('auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
      sessie = await haal('api/sessie').catch(() => sessie);
    } else if (t.hasAttribute('data-kies-backup')) {
      document.querySelector('[data-backup-bestand]')?.click();
      return;
    } else if (t.hasAttribute('data-opnieuw')) {
      bevestig = 'opnieuw';
    } else if (t.hasAttribute('data-toch-niet')) {
      bevestig = null;
    } else if (t.hasAttribute('data-ja-opnieuw')) {
      t.disabled = true;
      // Eerst een back-up op dit apparaat (besluit 151); de dienst bewaart er zelf ook een.
      await bewaarOpApparaat('api/back-up');
      await stuurGegevens('api/opnieuw', { zeker: true });
      bevestig = null;
      melding = 'Alles is weg, en de back-up staat op dit apparaat. Smart Climate start opnieuw…';
      teken();
      void wachtOpHerstart('thuis.html');
      return;
    } else if (t.hasAttribute('data-ja-terug')) {
      t.disabled = true;
      await stuurGegevens('api/back-up', bevestig.backup);
      bevestig = null;
      melding = 'De back-up staat terug. Smart Climate start opnieuw…';
      teken();
      void wachtOpHerstart();
      return;
    } else {
      return;
    }
    teken();
  } catch (err) {
    t.disabled = false;
    zegFout(err.message);
  }
});
document.addEventListener('change', async (e) => {
  const veld = e.target.closest('[data-backup-bestand]');
  if (!veld?.files?.[0]) return;
  const bestand = veld.files[0];
  try {
    const backup = JSON.parse(await bestand.text());
    if (backup?.soort !== 'smart-climate-back-up') throw new Error('Dit is geen back-up van Smart Climate');
    bevestig = { backup, naam: bestand.name };
    teken();
  } catch (err) {
    zegFout(err instanceof SyntaxError ? 'Dit bestand is niet te lezen' : err.message);
  }
});
void laadAlles();
