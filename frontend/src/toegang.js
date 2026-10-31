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

const { $$, nl, esc, haal, deur } = app;

let sessie = null;
let gegevens = null;
let health = null;
let zon = null;
let bewoners = null;
let sleutel = null;
/** Waar de assistent van Home Assistant zijn vraag stelt (besluit 177). */
let vraagAdres = null;
/** De integratie in Home Assistant (besluit 184): of hij er staat, via de add-on of HACS, en welke versie geladen is. */
let integratie = null;
let integratieZin = '';
/** Wat /api/gegevens zegt (besluit 151): of je de hoofdgebruiker bent, het logboek, de back-ups. */
let opslag = null;
/** Wat er gevraagd wordt: null, 'opnieuw', of { backup, naam } om terug te zetten. */
let bevestig = null;
/** Een melding bij je gegevens, zoals "SunArc start opnieuw". */
let melding = null;

async function laadAlles() {
  const [s, g, h, z, b, k, o, i] = await Promise.allSettled([haal('api/sessie'), haal('api/export/info'), haal('api/versie'), haal('api/zon'), haal('api/bewoners'), fetch('api/sleutel', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)), haal('api/gegevens'), fetch('api/integratie', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))]);
  if (o.status === 'fulfilled') opslag = o.value;
  if (i.status === 'fulfilled') integratie = i.value;
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
  const inlog = !sessie ? '…' : sessie.toegang === 'open' ? t('instellingen.geenInlog') : sessie.ingelogd ? `${sessie.naam ?? t('toegang.ingelogd')}${sessie.rol ? `, ${t(`toegang.rol.${sessie.rol}`)}` : ''}` : t('toegang.nietIngelogd');
  const namen = bewoners ? bewoners.bewoners.map((b) => b.naam).join(', ') || t('instellingen.nogNiemand') : '…';
  const versie = { id: 'versie', titel: t('toegang.versie'), zin: health?.nummer ? t('toegang.versieNieuw', { nummer: health.nummer }) : '…', stand: health ? 'goed' : null };
  // Een gast (besluit 151): alleen wie hij is en de versie; instellingen veranderen kan hij niet.
  if (isGast()) return [{ id: 'bewoners', titel: t('jij.kop'), zin: inlog, stand: sessie ? 'goed' : null }, versie];
  return [
    { id: 'bewoners', titel: t('instellingen.bewoners'), zin: namen, stand: bewoners ? 'goed' : null },
    ...(sleutel ? [{ id: 'assistent', titel: t('toegang.sleutel'), zin: t('toegang.voorHA'), stand: 'goed' }] : []),
    { id: 'gegevens', titel: t('toegang.gegevens'), zin: gegevens?.bestanden != null ? t('toegang.dagenBewaard', { n: gegevens.bestanden }) : '…', stand: gegevens ? 'goed' : null },
    versie,
  ];
}

/** Een zin met eigen HTML uit de teksten (<b>): wat erin komt, wordt ontsnapt. */
const metHtml = (sleutel, p = {}) => t(sleutel, Object.fromEntries(Object.entries(p).map(([k, v]) => [k, esc(v)])));

/**
 * Wie je bent (besluit 167, eerst het deel Inloggen): je naam en wat je mag.
 * Uitloggen alleen als de app zelf om de inlog vraagt; via Home Assistant log
 * je daar uit.
 */
function wieVorm() {
  const s = sessie;
  if (!s) return '';
  if (s.toegang === 'open') return `<p class="klein" style="margin: 0">${esc(t('toegang.open'))}</p>`;
  const rol = s.rol ? `, ${s.rol}` : '';
  if (s.toegang === 'ingress') return `<p class="klein" style="margin: 0">${metHtml('toegang.viaHA', { naam: s.naam ?? '', rol })}</p>`;
  const terug = encodeURIComponent(location.pathname);
  return s.ingelogd
    ? `<div class="knoppenrij" style="align-items: center"><p class="klein" style="margin: 0; flex: 1">${metHtml('toegang.jeBent', { naam: s.naam ?? '', rol })}</p><button type="button" class="knop" data-uitloggen>${esc(t('toegang.uitloggen'))}</button></div>`
    : `<div class="knoppenrij" style="align-items: center"><p class="klein" style="margin: 0; flex: 1">${esc(t('toegang.nietIngelogdZin'))}</p><a class="knop knop-licht" href="auth/login?terug=${terug}" style="display: inline-flex; align-items: center; text-decoration: none">${esc(t('toegang.inloggen'))}</a></div>`;
}

/** Bewoners (besluit 147): wie jij bent, kort wie hier woont, en de weg naar de pagina. */
function bewonersVorm() {
  const b = bewoners;
  if (isGast()) return `<h2 class="kop-2">${esc(t('jij.kop'))}</h2>${wieVorm()}<p class="mini" style="margin: 0">${esc(t('toegang.gast'))}</p>`;
  if (!b) return `<h2 class="kop-2">${esc(t('instellingen.bewoners'))}</h2><p class="klein" style="margin: 0">${esc(t('algemeen.laden'))}…</p>`;
  const rijen = b.bewoners.map((x) => `<div class="rij-b">${esc(x.naam)}${x.ik ? esc(t('toegang.jij')) : ''}<span>${esc(t(x.hoofd ? 'toegang.hoofdgebruiker' : x.comfort === 'eigen' ? 'toegang.eigenComfort' : 'toegang.volgt'))}${x.thuis == null ? '' : esc(t(x.thuis ? 'toegang.thuis' : 'toegang.weg'))}</span></div>`).join('');
  return `<h2 class="kop-2">${esc(t('instellingen.bewoners'))}</h2>
    ${wieVorm()}
    <p class="mini" style="margin: 0">${esc(t('toegang.rollen'))}</p>
    <p class="klein" style="margin: 0">${esc(t('toegang.volgorde'))}</p>
    <div>${rijen || `<p class="klein" style="margin: 0">${esc(t('toegang.nogNiemand'))}</p>`}</div>
    <a class="knop knop-licht" href="bewoners.html" style="align-self: start; display: inline-flex; align-items: center; text-decoration: none">${esc(t('toegang.naarBewoners'))}</a>`;
}

/**
 * De sleutel voor de assistent van Home Assistant (besluit 147), alleen voor
 * een beheerder. Sinds besluit 184 gaat het via de integratie SunArc:
 * met de add-on meldt die zich vanzelf; anders vul je hier het adres en de
 * sleutel in. Geen YAML meer.
 */
function assistentVorm() {
  return `<h2 class="kop-2">${esc(t('toegang.sleutel'))}</h2>
    <p class="klein" style="margin: 0">${esc(t('toegang.assistUitleg'))}</p>
    ${integratieVorm()}
    <p class="klein" style="margin: 0">${esc(t('toegang.zonderAddon'))}</p>
    ${vraagAdres ? `<div class="sleutel" data-vraagadres>${esc(vraagAdres.replace(/\/api\/vraag$/, ''))}</div>` : ''}
    <div class="sleutel" data-sleutel>${esc(sleutel ?? '')}</div>
    <p class="mini" style="margin: 0">${esc(t('toegang.deelNiet'))}</p>`;
}

/**
 * De integratie neerzetten (besluit 184): via HACS, of voor wie dat niet heeft
 * met een knop; de add-on kopieert dan alleen custom_components/smart_climate.
 * Home Assistant laadt hem na een herstart, en dat doe je zelf.
 */
/** De stappen in HACS, met het adres om te kopiëren. */
const hacsStappen = () => `<ol class="klein stappen">
    <li>${t('toegang.hacs.1')}</li>
    <li>${t('toegang.hacs.2')}</li>
    <li>${t('toegang.hacs.3')}<div class="sleutel">https://github.com/Ricardo-switch/hems-climate</div></li>
    <li>${t('toegang.hacs.4')}</li>
  </ol>`;
const eenmalig = () => `<p class="mini" style="margin: 0">${esc(t('toegang.eenmalig'))}</p>`;

/**
 * Of de integratie ook is toegevoegd (22 oktober 2026): met alleen de bestanden
 * kan Assist SunArc nog niet vragen.
 */
function toegevoegdZin(i) {
  if (i.toegevoegd === true) return `<p class="klein" style="margin: 0">${t('toegang.toegevoegd')}</p>`;
  if (i.toegevoegd !== false || !i.geladen) return '';
  return `<p class="klein" style="margin: 0; color: var(--zon-t)">${esc(t('toegang.nietToegevoegd'))}</p>`;
}

/*
 * De assistent met één knop (besluit 202): in de add-on zet SunArc de
 * integratie neer, herstart Home Assistant en voegt hem toe. Zolang het loopt,
 * kijkt de pagina elke drie tellen waar het is.
 */
let aanKijk = null;
function aanzetVorm(i) {
  const a = i.aanzetten;
  if (a.bezig && !aanKijk) {
    aanKijk = setTimeout(async () => {
      aanKijk = null;
      integratie = await fetch('api/integratie', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : integratie)).catch(() => integratie);
      teken();
    }, 3000);
  }
  const zin = a.bezig ? `${t(`inr.as.s.${a.stap}`)}…` : a.fout ? t('inr.as.fout', { fout: a.fout }) : t('inr.as.zin');
  return `<p class="klein" style="margin: 0${a.fout && !a.bezig ? '; color: var(--gloed-t)' : ''}" aria-live="polite">${esc(zin)}</p>
    ${a.bezig ? '' : `<button type="button" class="knop knop-licht" data-assistent-aan style="align-self: start">${esc(t(a.fout ? 'inr.as.opnieuw' : 'inr.as.knop'))}</button>`}${eenmalig()}`;
}

function integratieVorm() {
  const i = integratie;
  const zin = integratieZin ? `<p class="mini" style="margin: 0" aria-live="polite">${esc(integratieZin)}</p>` : '';
  // Met één knop, in de add-on, zolang hij nog niet werkt (of het net loopt).
  if (i?.aanzetten && i.staat !== 'anders' && (i.aanzetten.bezig || i.toegevoegd !== true || i.geladen !== i.versie)) return aanzetVorm(i);
  if (!i?.kan) return `<p class="klein" style="margin: 0">${esc(t('toegang.viaHACS'))}</p>${hacsStappen()}${eenmalig()}`;
  if (i.staat === 'anders') return `<p class="klein" style="margin: 0">${i.versie ? metHtml('toegang.staatHACSVersie', { versie: i.versie }) : t('toegang.staatHACS')}</p>${toegevoegdZin(i)}${zin}`;
  if (i.staat === 'nee') {
    return `<p class="klein" style="margin: 0">${t('toegang.zonderHACS')}</p>
      <button type="button" class="knop knop-licht" data-integratie style="align-self: start">${esc(t('toegang.zetNeer'))}</button>${zin}
      <details class="hacs"><summary class="klein">${esc(t('toegang.hebHACS'))}</summary>${hacsStappen()}</details>${eenmalig()}`;
  }
  const herstart = i.geladen !== i.versie;
  return `<p class="klein" style="margin: 0">${metHtml('toegang.staatAddon', { versie: i.versie ?? '?' })}</p>
    ${herstart ? `<p class="klein" style="margin: 0; color: var(--zon-t)">${esc(t('toegang.herstart'))}</p>` : toegevoegdZin(i)}${zin}${eenmalig()}`;
}

const linkKnop = (href, tekst, extra = '') => `<a class="knop knop-licht" href="${href}" ${extra} style="align-self: start; display: inline-flex; align-items: center; text-decoration: none">${esc(tekst)}</a>`;
/** "smart-climate-back-up-2026-10-17-08-00-00.json" wordt een datum en tijd. */
function wanneerBackup(naam) {
  const m = /(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/.exec(naam ?? '');
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toLocaleString(taal.locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
}

function gegevensVorm() {
  const g = gegevens;
  const mb = g?.bytes != null ? nl(g.bytes / 1_000_000, 0) : null;
  const nu = g?.bestanden != null ? t(mb ? 'toegang.nuDagenMb' : 'toegang.nuDagen', { n: g.bestanden, mb }) : '';
  const logboek = `<h2 class="kop-2">${esc(t('toegang.gegevens'))}</h2>
    <p class="klein" style="margin: 0">${esc(t('toegang.gegevensZin', { nu }))}</p>
    <p class="mini" style="margin: 0">${esc(t('toegang.nietsNaarBuiten'))}</p>`;
  if (melding) return `${logboek}<p class="klein" style="margin: 0" data-melding>${esc(melding)}</p>`;
  if (!opslag) return logboek;
  if (!opslag.hoofd) return `${logboek}<p class="klein" style="margin: 0">${esc(t('toegang.alleenHoofd'))}</p>`;

  if (bevestig === 'opnieuw') {
    return `${logboek}
      <h3 class="kop-3" style="margin: 6px 0 0">${esc(t('toegang.opnieuwVraag'))}</h3>
      <p class="klein" style="margin: 0">${esc([t('toegang.opnieuwWeg'), t(opslag.configWeg ? 'toegang.opnieuwInrichten' : 'toegang.configBlijft'), t('toegang.eerstBackup')].join(' '))}</p>
      <span class="fout" data-fout></span>
      <div class="knoppenrij"><button type="button" class="knop" data-toch-niet>${esc(t('toegang.tochNiet'))}</button><button type="button" class="knop gevaar" data-ja-opnieuw>${esc(t('toegang.jaOpnieuw'))}</button></div>`;
  }
  if (bevestig?.backup) {
    const b = bevestig.backup;
    const wanneer = b.gemaakt ? new Date(b.gemaakt).toLocaleString(taal.locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : null;
    return `${logboek}
      <h3 class="kop-3" style="margin: 6px 0 0">${esc(t('toegang.terugVraag'))}</h3>
      <p class="klein" style="margin: 0">${esc(`${bevestig.naam}${wanneer ? t('toegang.gemaaktOp', { wanneer }) : ''}${b.app ? t('toegang.metVersie', { versie: b.app }) : ''}. ${t('toegang.terugZin')}`)}</p>
      <span class="fout" data-fout></span>
      <div class="knoppenrij"><button type="button" class="knop" data-toch-niet>${esc(t('toegang.tochNiet'))}</button><button type="button" class="knop knop-licht" data-ja-terug>${esc(t('toegang.terugzetten'))}</button></div>`;
  }
  const laatste = wanneerBackup(opslag.backups?.[0]);
  return `${logboek}
    <h3 class="kop-3" style="margin: 6px 0 0">${esc(t('toegang.backup'))}</h3>
    <p class="klein" style="margin: 0">${esc(t('toegang.backupZin'))}${laatste ? ` ${esc(t('toegang.laatste', { wanneer: laatste }))}` : ''}</p>
    <div class="knoppenrij">${linkKnop('api/back-up', t('toegang.downloaden'), 'download')}<button type="button" class="knop" data-kies-backup>${esc(t('toegang.kiesBackup'))}</button></div>
    <input type="file" accept=".json,application/json" data-backup-bestand hidden>
    <span class="fout" data-fout></span>
    ${g?.bestanden ? `<h3 class="kop-3" style="margin: 6px 0 0">${esc(t('toegang.logboek'))}</h3>
    <p class="klein" style="margin: 0">${esc(t('toegang.logboekZin'))}</p>
    ${linkKnop('api/export', t('toegang.logboekDownloaden'), 'download')}` : ''}
    <h3 class="kop-3" style="margin: 6px 0 0">${esc(t('toegang.opnieuw'))}</h3>
    <p class="klein" style="margin: 0">${esc(t('toegang.opnieuwZin'))}</p>
    <button type="button" class="knop gevaar" data-opnieuw style="align-self: start">${esc(t('toegang.opnieuw'))}</button>`;
}

/**
 * Wacht tot SunArc weer antwoordt na opnieuw starten, en laadt dan de
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
  melding = t('toegang.nogNiet');
  teken();
}

/** Een bestand op dit apparaat bewaren, zoals de downloadknop doet. */
async function bewaarOpApparaat(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(t('toegang.backupMis'));
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
  if (!r.ok) throw new Error(uit.fout ? uit.fout.charAt(0).toUpperCase() + uit.fout.slice(1) : t('toegang.lukteNiet'));
  return uit;
}

function zegFout(tekst) {
  $$('[data-fout]').forEach((el) => (el.textContent = tekst));
}

/** De versie en wat er nieuw is (besluit 131). */
function versieVorm() {
  const v = health;
  if (!v?.nummer) return `<h2 class="kop-2">${esc(t('toegang.versie'))}</h2><p class="klein" style="margin: 0">${esc(t('toegang.onbekend'))}</p>`;
  const gebouwd = v.gebouwd ? taal.datum(v.gebouwd, { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const dag = (d) => taal.datum(`${d}T12:00:00`, { day: 'numeric', month: 'long' });
  // De nieuwste open, de rest ingeklapt, hooguit tien terug; per versie nieuw, beter en opgelost (besluit 133).
  const SOORTEN = ['nieuw', 'beter', 'opgelost'].map((k) => [k, t(`basis.versie.${k}`)]);
  const inhoud = (n) => SOORTEN.filter(([k]) => (n[k] ?? []).length).map(([k, naam]) => `<div class="soort ${k}"><span class="label">${esc(naam)}</span><ul>${n[k].map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('');
  const kort = (n) => SOORTEN.filter(([k]) => (n[k] ?? []).length).map(([k, naam]) => t('toegang.telt', { n: n[k].length, soort: naam.toLowerCase() })).join(', ');
  const nieuw = (v.nieuw ?? []).slice(0, 10).map((n, i) => `<details class="nieuw"${i === 0 ? ' open' : ''}><summary><b>${esc(t('toegang.versieNummer', { nummer: n.versie }))}</b><span class="mini">${esc(dag(n.datum))}${i === 0 || !kort(n) ? '' : ` · ${esc(kort(n))}`}</span></summary>${inhoud(n)}</details>`).join('');
  const komt = t(v.installatie === 'add-on' ? 'toegang.addon' : 'toegang.server');
  return `<h2 class="kop-2">${esc(t('toegang.versieNummer', { nummer: v.nummer }))}</h2>
    <p class="klein" style="margin: 0">${gebouwd ? `${esc(t('toegang.gebouwd', { datum: gebouwd }))} ` : ''}${esc(komt)}</p>
    ${nieuw ? `<h3 class="kop-3" style="margin: 6px 0 0">${esc(t('toegang.watNieuw'))}</h3>${nieuw}` : ''}
    <p class="mini" style="margin: 0">${esc(t('toegang.bouw', { commit: v.commit }))}</p>`;
}

/** Per deel hoeveel punten er ernaast staan (toegang.naast.<deel>.<n>). */
const NAAST = { bewoners: 4, assistent: 3, gegevens: 4, versie: 4 };

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  const nu = groep.tekenDelen(delen());
  const vorm = { bewoners: bewonersVorm, assistent: assistentVorm, gegevens: gegevensVorm, versie: versieVorm }[nu]?.() ?? '';
  $$('[data-vorm]').forEach((el) => (el.innerHTML = vorm));
  const deel = NAAST[nu] ? nu : 'bewoners';
  const lijst = Array.from({ length: NAAST[deel] }, (_, i) => t(`toegang.naast.${deel}.${i + 1}`));
  $$('[data-naast]').forEach((el) => (el.innerHTML = `<div class="glas"><h3>${esc(t(`toegang.naast.${deel}`))}</h3><ul>${lijst.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`));
}
/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
addEventListener('hashchange', teken);

app.start('instellingen');
document.addEventListener('click', async (e) => {
  const knop = e.target.closest('button');
  if (!knop) return;
  // De assistent met één knop (besluit 202).
  if (knop.hasAttribute('data-assistent-aan')) {
    knop.disabled = true;
    const res = await deur('api/integratie', { aanzetten: true }).catch(() => null);
    if (res?.ok) integratie = await res.json().catch(() => integratie);
    teken();
    return;
  }
  // De integratie neerzetten (besluit 184).
  if (knop.hasAttribute('data-integratie')) {
    knop.disabled = true;
    integratieZin = t('toegang.neerzetten');
    teken();
    const res = await deur('api/integratie', {}).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (res?.ok) {
      integratie = body;
      integratieZin = t('toegang.neergezet');
    } else integratieZin = t('jij.meld.lukteNiet', { fout: String(body?.fout ?? t('jij.meld.geenAntwoord')).replace(/\.$/, '') });
    teken();
    return;
  }
  try {
    if (knop.hasAttribute('data-uitloggen')) {
      await fetch('auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
      sessie = await haal('api/sessie').catch(() => sessie);
    } else if (knop.hasAttribute('data-kies-backup')) {
      document.querySelector('[data-backup-bestand]')?.click();
      return;
    } else if (knop.hasAttribute('data-opnieuw')) {
      bevestig = 'opnieuw';
    } else if (knop.hasAttribute('data-toch-niet')) {
      bevestig = null;
    } else if (knop.hasAttribute('data-ja-opnieuw')) {
      knop.disabled = true;
      // Eerst een back-up op dit apparaat (besluit 151); de dienst bewaart er zelf ook een.
      await bewaarOpApparaat('api/back-up');
      await stuurGegevens('api/opnieuw', { zeker: true });
      bevestig = null;
      melding = t('toegang.allesWeg');
      teken();
      void wachtOpHerstart('thuis.html');
      return;
    } else if (knop.hasAttribute('data-ja-terug')) {
      knop.disabled = true;
      await stuurGegevens('api/back-up', bevestig.backup);
      bevestig = null;
      melding = t('toegang.staatTerug');
      teken();
      void wachtOpHerstart();
      return;
    } else {
      return;
    }
    teken();
  } catch (err) {
    knop.disabled = false;
    zegFout(err.message);
  }
});
document.addEventListener('change', async (e) => {
  const veld = e.target.closest('[data-backup-bestand]');
  if (!veld?.files?.[0]) return;
  const bestand = veld.files[0];
  try {
    const backup = JSON.parse(await bestand.text());
    if (backup?.soort !== 'smart-climate-back-up') throw new Error(t('toegang.geenBackup'));
    bevestig = { backup, naam: bestand.name };
    teken();
  } catch (err) {
    zegFout(err instanceof SyntaxError ? t('toegang.nietTeLezen') : err.message);
  }
});
void laadAlles();
