/*
 * Functies (besluiten 109, 111 en 130). Welke camera's de app toont en met
 * welk beeld, welke melder de deurbel is, of je licht en screens bedient in de
 * app, en waar het weer vandaan komt. Praten met je huis (besluit 148): welk
 * taalmodel uit Home Assistant de assistent laat praten in eigen woorden, en of
 * hij met een zin mag bedienen. Meldingen (besluit 149): wanneer een batterij of
 * een airco-filter een melding geeft. In de opbouw van elke groep (130): links
 * de delen, wat je kiest wordt meteen bewaard. Bewaren vraagt een beheerder.
 * De dienst doet een voorstel uit wat Home Assistant heeft.
 *
 * Onder Weergave (besluit 167): dit scherm (volledig scherm, per apparaat),
 * het always-on display van de wand, en wanneer het scherm uitgaat. Dat stond
 * eerst bij het potlood op Thuis ("Als niemand kijkt") en bij Bewoners en
 * toegang. Licht en screens heeft per kamer de lampen, scènes en screens, met
 * een schakelaar om er een uit de app te halen.
 */
'use strict';

const { $$, esc, haal } = app;

let info = null;
let concept = null;
let zon = null;
/** Het laatste proefantwoord van het taalmodel (besluit 148): vast naast eigen woorden. */
let proef = null;
/** De voorkeuren (besluit 164): wat de wand doet als niemand kijkt, en of jij dat mag veranderen. */
let voorkeur = null;
/** Het huis en de indeling: de lampen, scènes en screens per kamer, en de bewegingsmelders. */
let huisData = null;
let indeling = null;

async function laad() {
  const [f, z, v, h, i] = await Promise.allSettled([haal('api/functies'), haal('api/zon'), haal('api/voorkeuren'), haal('api/huis'), haal('api/indeling')]);
  if (z.status === 'fulfilled') zon = z.value;
  if (v.status === 'fulfilled') voorkeur = v.value;
  if (h.status === 'fulfilled') huisData = h.value;
  if (i.status === 'fulfilled') indeling = i.value;
  if (f.status === 'fulfilled') {
    info = f.value;
    concept = JSON.parse(JSON.stringify(info.instellingen ?? info.voorstel));
    concept.weer ??= info.voorstel.weer;
    concept.licht ??= info.voorstel.licht;
    concept.schermen ??= info.voorstel.schermen ?? { bedienen: true };
    concept.praten ??= info.voorstel.praten ?? { taalmodel: null, bedienen: true };
    concept.praten.spraak ??= null;
    concept.meldingen ??= info.voorstel.meldingen ?? { batterij: 10, filter: 10 };
  }
  teken();
}

/* ------------------------------------------------------------ tekenen */

function keuzes(label, sleutel, opties, huidig, uit = false) {
  return `<div class="keuzes" role="group" aria-label="${esc(label)}">${opties.map(([w, t]) => `<button type="button" data-kies="${esc(sleutel)}" data-waarde='${esc(JSON.stringify(w))}' aria-pressed="${JSON.stringify(w) === JSON.stringify(huidig)}" ${uit ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>`;
}

/** Het beeld dat van deze camera in de lijst staat, of null als hij niet getoond wordt. */
const gekozenBeeld = (c) => c.beelden.find((b) => concept.cameras.lijst.includes(b.id))?.id ?? null;

function cameras() {
  const lijst = info.gevonden.cameras;
  const aan = concept.cameras.aan;
  const rijen = lijst
    .map((c, i) => {
      const beeld = gekozenBeeld(c);
      const opties = [[null, 'Niet tonen'], ...c.beelden.map((b) => [b.id, b.naam.charAt(0).toUpperCase() + b.naam.slice(1)])];
      return `<div class="regelrij" style="flex-direction: column; align-items: stretch"><div class="l"><b>${esc(c.naam)}</b><span>${beeld ? 'In de app, in de kamer waar hij staat' : 'Niet in de app'}</span></div>${keuzes(`Beeld van ${c.naam}`, `camera:${i}`, opties, beeld, !aan)}</div>`;
    })
    .join('');
  return `<h2 class="kop-2">Camera's</h2>
    ${keuzes("Camera's in de app", 'camerasAan', [[true, 'Aan'], [false, 'Uit']], aan)}
    <div>${lijst.length ? rijen : '<p class="uitleg">Geen camera’s gevonden in Home Assistant.</p>'}</div>
    <p class="mini">Vloeiend is lichter voor de tablet; scherp heeft meer detail. Kijken vraagt de inlog met je Home Assistant-account.</p>`;
}

function deurbel() {
  const d = concept.deurbel;
  const melders = info.gevonden.melders;
  const beelden = info.gevonden.cameras.flatMap((c) => c.beelden.map((b) => ({ id: b.id, naam: c.beelden.length > 1 ? `${c.naam}, ${b.naam}` : c.naam })));
  const opt = (lijst, huidig, leeg) => `<option value="">${esc(leeg)}</option>${lijst.map((x) => `<option value="${esc(x.id)}" ${x.id === huidig ? 'selected' : ''}>${esc(x.naam)}</option>`).join('')}`;
  const zeker = melders.filter((m) => m.zeker);
  const misschien = melders.filter((m) => !m.zeker);
  const melderOpties = `<option value="">Kies de melder…</option>${zeker.length ? `<optgroup label="Een deurbel">${zeker.map((m) => `<option value="${esc(m.id)}" ${m.id === d.melder ? 'selected' : ''}>${esc(m.naam)}</option>`).join('')}</optgroup>` : ''}${misschien.length ? `<optgroup label="Heet als een deurbel">${misschien.map((m) => `<option value="${esc(m.id)}" ${m.id === d.melder ? 'selected' : ''}>${esc(m.naam)}</option>`).join('')}</optgroup>` : ''}`;
  const uit = !d.aan;
  return `<h2 class="kop-2">Deurbel</h2>
    ${keuzes('Deurbel', 'belAan', [[true, 'Aan'], [false, 'Uit']], d.aan, !melders.length)}
    ${melders.length ? '' : '<p class="uitleg">Geen deurbel gevonden in Home Assistant. Een deurbel met een melder (Reolink, Ring, Nest, UniFi en andere) verschijnt hier vanzelf.</p>'}
    <label class="veldnaam">Melder die afgaat als er wordt aangebeld<select class="invoer" data-veld="melder" ${uit ? 'disabled' : ''}>${melderOpties}</select></label>
    <label class="veldnaam">Beeld dat dan verschijnt<select class="invoer" data-veld="camera" ${uit ? 'disabled' : ''}>${opt(beelden, d.camera, 'Kies een camera…')}</select></label>
    <span class="veldnaam">Het scherm van de tablet aanzetten</span>
    ${keuzes('Scherm aanzetten', 'schermAan', [[true, 'Ja'], [false, 'Nee']], d.schermAan, uit)}
    <span class="veldnaam">Hoe lang het beeld blijft staan</span>
    ${keuzes('Hoe lang', 'seconden', [[60, '1 minuut'], [120, '2 minuten'], [300, '5 minuten']], d.seconden, uit)}`;
}

/*
 * Licht en screens (besluit 167): bedienen in de app of alleen kijken, en per
 * kamer de lampen, scènes en screens, met een schakelaar om er een uit de app
 * te halen (dat is verbergen, zoals bij Kamers en indeling). Bij een screen of
 * hij zijn stand terugmeldt: alleen zo'n screen mag later in de regeling.
 * Smart Climate regelt licht en screens niet; dat doe je zelf.
 */
function lichtPerKamer() {
  const lay = indeling?.indeling ?? indeling?.voorstel;
  const weg = new Set(lay?.verborgen ?? []);
  const kamers = [];
  for (const e of huisData?.etages ?? []) {
    for (const r of e.ruimtes ?? []) {
      const dingen = (r.apparaten ?? []).filter((d) => d.soort === 'licht' || d.soort === 'screen');
      kamers.push({ id: r.id, naam: r.naam, dingen, scenes: r.scenes ?? [] });
    }
  }
  // Wat verborgen is, staat bij de kamer waar het stond.
  for (const v of huisData?.verborgen ?? []) {
    if (v.soort !== 'licht' && v.soort !== 'screen') continue;
    const k = kamers.find((x) => x.id === lay?.apparaten?.[v.id]?.kamer);
    if (k) k.dingen.push({ ...v, verborgen: true });
  }
  return kamers.filter((k) => k.dingen.length || k.scenes.length).map((k) => ({ ...k, dingen: k.dingen.map((d) => ({ ...d, verborgen: d.verborgen || weg.has(d.id) })) }));
}

function licht() {
  const mag = info.lichtMogelijk === true;
  const schermMag = info.schermMogelijk === true;
  const kamers = lichtPerKamer();
  // Per kamer een knopje per lamp en screen: aan staat hij in de app. Compact, zodat het op de wand past.
  const knopje = (d) => {
    const terug = d.soort === 'screen' ? (d.scherm?.terugmelding ? 'meldt terug' : d.scherm?.terugmelding === false ? 'geen terugmelding' : 'screen') : '';
    return `<button type="button" data-in-app="${esc(d.id)}" aria-pressed="${!d.verborgen}" aria-label="${esc(d.naam)} in de app">${esc(d.naam)}${terug ? `<small> · ${esc(terug)}</small>` : ''}</button>`;
  };
  const lijst = kamers
    .map((k) => `<div class="lichtkamer"><b>${esc(k.naam)}</b>${k.dingen.length ? `<div class="keuzes">${k.dingen.map(knopje).join('')}</div>` : ''}${k.scenes.length ? `<span class="mini">Scènes: ${esc(k.scenes.map((x) => x.naam).join(', '))}</span>` : ''}</div>`)
    .join('');
  // Alleen wat deze installatie toestaat (besluit 130): een knop die niets kan, staat er niet.
  return `<h2 class="kop-2">Licht en screens</h2>
    ${mag ? `<span class="veldnaam">Licht en scènes</span>${keuzes('Licht bedienen', 'lichtAan', [[true, 'Bedienen in de app'], [false, 'Alleen kijken']], concept.licht.bedienen)}` : ''}
    ${schermMag ? `<span class="veldnaam">Screens en zonnescherm</span>${keuzes('Schermen bedienen', 'schermenAan', [[true, 'Bedienen in de app'], [false, 'Alleen kijken']], concept.schermen.bedienen)}` : ''}
    <p class="mini">${mag || schermMag ? 'Bedienen doe je in het huis, bij de kamer. Smart Climate regelt ze niet.' : 'Deze installatie staat bedienen in de app niet toe; je ziet wel wat er aan staat. Wie Smart Climate installeerde, kan het aanzetten.'}</p>
    ${lijst ? `<h3 class="kop-3" style="margin: 8px 0 0">In de app</h3><p class="mini">Tik er een uit om hem niet meer in de app te tonen; in Home Assistant blijft hij gewoon.${kamers.some((k) => k.dingen.some((d) => d.soort === 'screen')) ? ' Alleen een screen dat zijn stand terugmeldt, zoals Somfy io, kan later meedoen tegen de zon.' : ''}</p><div class="lichtkamers">${lijst}</div>` : ''}`;
}

/* ------------------------------------------------------------ weergave */

const NIEMAND = { nacht: true, van: '23:00', tot: '07:00', rustMin: 5, aanMin: 5, weg: true, melder: null };
const niemandNu = () => ({ ...NIEMAND, ...voorkeur?.wand?.niemand });
const magWand = () => !!voorkeur?.wand?.magAanpassen;
const schakel = (aan, data, label, uit = false) => `<button type="button" class="schakelaar" role="switch" aria-checked="${aan}" aria-label="${esc(label)}" ${data} ${uit ? 'disabled' : ''}></button>`;
const nkKeuzes = (label, attr, opties, huidig, uit = false) => `<div class="keuzes" role="group" aria-label="${esc(label)}">${opties.map(([w, t]) => `<button type="button" data-${attr}="${w}" aria-pressed="${w === huidig}" ${uit ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>`;
const alleenHoofd = () => (magWand() ? '' : '<p class="uitleg" style="color: var(--zon)">Alleen de hoofdgebruiker kan dit veranderen.</p>');
const voorDeWand = '<p class="mini">Voor het scherm aan de wand: het account dat bij Bewoners een scherm is. Een telefoon of laptop doet nooit mee.</p>';

/** Dit scherm (besluit 155): volledig scherm, per apparaat; alleen als de app in Home Assistant draait. */
function scherm() {
  const aan = app.volledigGekozen();
  return `<h2 class="kop-2">Dit scherm</h2>
    <div class="regelrij"><div class="l"><b>Volledig scherm</b><span>Zonder de zijbalk en de kopbalk van Home Assistant, en zonder de balken van de browser.</span></div><button type="button" class="schakelaar" role="switch" aria-checked="${aan}" aria-label="Volledig scherm" data-volledig></button></div>
    <p class="mini">Alleen op dit apparaat: aan op de tablet aan de muur, uit op je telefoon. Het hele scherm komt bij de eerste tik. Terug naar Home Assistant gaat met de knop boven de bel, of hieronder.</p>
    <div><button type="button" class="knop" data-naar-ha>Naar Home Assistant</button></div>`;
}

/** Het always-on display (besluiten 164 en 165): na hoeveel minuten zonder aanraken, en of hij er is. */
function aod() {
  const n = niemandNu();
  const mag = magWand();
  const aan = n.rustMin > 0;
  const zin = aan
    ? `Raakt er ${n.rustMin} minuten niemand het scherm aan, dan toont het de klok, wat het huis doet en het weer. Na zonsondergang gedimd. Een tik opent de app weer.`
    : 'Het scherm blijft Thuis tonen, ook als niemand kijkt.';
  return `<h2 class="kop-2">Always-on display</h2>
    <p class="klein" style="margin: 0" data-nk-zin>${esc(zin)}</p>
    <div class="regelrij"><div class="l"><b>Always-on display</b><span>De klok en het huis als niemand kijkt</span></div>${schakel(aan, 'data-nk-aod', 'Always-on display', !mag)}</div>
    <div class="${aan ? '' : 'uitgezet'}" data-nk-onder><span class="veldnaam">Verschijnt na zoveel minuten zonder aanraken</span>${nkKeuzes('Verschijnt na', 'nk-rust', [[2, '2 min'], [5, '5 min'], [15, '15 min']], n.rustMin, !mag || !aan)}</div>
    ${alleenHoofd()}${voorDeWand}
    <p class="mini">Op Vandaag, Apparaten, Opbrengst, de Assistent en een kamer gaat de wand na dezelfde tijd terug naar Thuis.</p>`;
}

/** Wanneer het scherm uitgaat (besluit 165): 's nachts, als niemand thuis is, na zoveel minuten zonder beweging. */
function schermUit() {
  const n = niemandNu();
  const mag = magWand();
  const ergens = n.nacht || n.weg;
  const melders = bewegingsmelders();
  const wanneer = n.nacht && n.weg ? `Van ${n.van} tot ${n.tot}, en als niemand thuis is,` : n.nacht ? `Van ${n.van} tot ${n.tot}` : n.weg ? 'Als niemand thuis is,' : null;
  const zin = wanneer
    ? `${wanneer} gaat het scherm uit als er ${n.aanMin} ${n.aanMin === 1 ? 'minuut' : 'minuten'} niemand beweegt.${n.melder ? ' Beweging zet het weer aan.' : ''} Een tik opent de app.`
    : 'Het scherm gaat nooit vanzelf uit.';
  const opties = melders.map((m) => `<option value="${esc(m.id)}" ${m.id === n.melder ? 'selected' : ''}>${esc(`${m.kamer}: ${m.naam}`)}</option>`).join('');
  return `<h2 class="kop-2">Scherm uit</h2>
    <p class="klein" style="margin: 0" data-nk-zin>${esc(zin)}</p>
    <div class="regelrij"><div class="l"><b>${esc('\u2019s Nachts')}</b><span>Of als iemand het huis op Nacht zet</span></div>${schakel(n.nacht, 'data-nk-nacht', 'Nachts uit', !mag)}</div>
    <div class="twee ${n.nacht ? '' : 'uitgezet'}"><label class="veldnaam">Vanaf<input class="invoer" type="time" step="900" value="${esc(n.van)}" data-nk-van ${mag && n.nacht ? '' : 'disabled'}></label><label class="veldnaam">Tot<input class="invoer" type="time" step="900" value="${esc(n.tot)}" data-nk-tot ${mag && n.nacht ? '' : 'disabled'}></label></div>
    <div class="regelrij"><div class="l"><b>Als niemand thuis is</b><span>Volgens de bewoners, of als het huis op Afwezig of Vakantie staat</span></div>${schakel(n.weg, 'data-nk-weg', 'Als niemand thuis is', !mag)}</div>
    <div class="${ergens ? '' : 'uitgezet'}"><span class="veldnaam">Uit na zoveel minuten zonder beweging</span>${nkKeuzes('Uit na', 'nk-aan', [[1, '1 min'], [5, '5 min'], [15, '15 min'], [30, '30 min']], n.aanMin, !mag || !ergens)}</div>
    ${melders.length ? `<div class="regelrij"><div class="l"><b>Wekken door beweging</b><span>Met een bewegingsmelder uit het huis</span></div>${schakel(!!n.melder, 'data-nk-beweging', 'Wekken door beweging', !mag)}</div>
    ${n.melder ? `<label class="veldnaam">Welke melder<select class="invoer" data-nk-melder ${mag ? '' : 'disabled'}>${opties}</select></label>` : ''}` : ''}
    ${alleenHoofd()}${voorDeWand}
    <p class="mini">De app maakt het scherm donkerder. Hoe fel het scherm zelf is, regelt de tablet; in Fully Kiosk gaat dat vanzelf mee, en gaat het scherm ${esc('\u2019s')} nachts echt uit.</p>`;
}

/** De bewegingsmelders in het huis, met hun kamer. */
function bewegingsmelders() {
  const uit = [];
  for (const e of huisData?.etages ?? []) for (const r of e.ruimtes ?? []) for (const d of r.apparaten ?? []) {
    const id = d.meting?.beweging?.id;
    if (id && !uit.some((m) => m.id === id)) uit.push({ id, naam: d.naam, kamer: r.naam });
  }
  return uit;
}

/** Wat de wand doet als niemand kijkt, bewaard bij de voorkeuren van de wand. Alles samen, zodat snel tikken niets kwijtraakt. */
function bewaarNiemand(wat) {
  const nieuw = { ...niemandNu(), ...wat };
  voorkeur = { ...voorkeur, wand: { ...voorkeur?.wand, niemand: nieuw } };
  teken();
  groep.bewaarStraks(async () => {
    const uit = await groep.stuur('api/voorkeuren', { plek: 'wand', niemand: nieuw });
    if (uit?.ok) voorkeur = uit.antwoord;
    return uit;
  }, 300);
}

/** Een lamp of screen uit de app halen, of terug (besluit 167): verbergen in de indeling. */
async function inApp(id, aan) {
  const lay = JSON.parse(JSON.stringify(indeling?.indeling ?? indeling?.voorstel ?? null));
  if (!lay) return;
  lay.verborgen = aan ? (lay.verborgen ?? []).filter((x) => x !== id) : [...new Set([...(lay.verborgen ?? []), id])];
  // Zichtbaar zolang de dienst bewaart; daarna het huis opnieuw.
  indeling = { ...indeling, indeling: lay };
  teken();
  groep.bewaarStraks(async () => {
    const uit = await groep.stuur('api/indeling', lay);
    if (uit?.ok) {
      const [h, i] = await Promise.allSettled([haal('api/huis'), haal('api/indeling')]);
      if (h.status === 'fulfilled') huisData = h.value;
      if (i.status === 'fulfilled') indeling = i.value;
      teken();
    }
    return uit;
  }, 200);
}

/** Praten met je huis (besluit 148, schets Wand-Instellingen-Praten). */
function praten() {
  const modellen = info.gevonden.taalmodellen ?? [];
  const p = concept.praten;
  const bedienKan = info.lichtMogelijk === true || info.schermMogelijk === true;
  const proefHtml = !p.taalmodel
    ? ''
    : proef === 'bezig'
      ? '<p class="mini">Even proberen…</p>'
      : proef
        ? `<div class="proef"><div><span>Vast antwoord</span>${esc(proef.vast)}</div><div class="eigen"><span>In eigen woorden</span>${proef.eigen ? esc(proef.eigen) : 'Lukte niet; dan hoor je het vaste antwoord.'}</div></div>
          ${proef.snel && proef.ms != null ? `<p class="mini">Antwoord na ${esc((proef.ms / 1000).toFixed(1).replace('.', ','))} seconden.</p>` : ''}
          ${proef.reden ? `<p class="uitleg" style="color: var(--zon)">${esc(proef.reden)}</p>` : ''}`
        : '';
  return `<h2 class="kop-2">Antwoorden in eigen woorden</h2>
    ${modellen.length ? keuzes('Taalmodel', 'taalmodel', [[null, 'Uit'], ...modellen.map((m) => [m.id, m.naam])], p.taalmodel) : '<p class="uitleg">Geen AI-taak gevonden in Home Assistant. Voeg er een toe, zoals Google Gemini bij Apparaten en diensten; dan staat hij hier.</p>'}
    <p class="mini">De assistent zegt het vaste antwoord op zijn eigen manier, met een taalmodel uit Home Assistant. Klopt een getal niet, of duurt het langer dan 5 seconden, dan hoor je het vaste antwoord.</p>
    ${p.taalmodel ? `<div><button type="button" class="knop knop-licht" data-proef>${proef && proef !== 'bezig' ? 'Nog een keer proberen' : 'Proberen'}</button></div>` : ''}
    ${proefHtml}
    <div class="buiten"><div><b class="wel">Gaat naar het taalmodel</b><span>Je vraag als tekst, het vaste antwoord met de getallen, en de namen van kamers, lampen en schermen</span></div><div><b class="niet">Blijft in huis</b><span>Je stem, camerabeelden, en wie er thuis is</span></div></div>
    ${bedienKan ? `<h2 class="kop-2" style="margin-top: 8px">Bedienen met de assistent</h2>
    ${keuzes('Bedienen met de assistent', 'pratenBedienen', [[true, 'Aan'], [false, 'Uit']], p.bedienen)}
    <p class="mini">Zeg wat je wilt, zoals "doe het licht beneden wat zachter" of "screen dicht". Het gebeurt meteen, en het huis zegt wat het deed. Lampen en scènes${info.schermMogelijk ? ', screens en het zonnescherm' : ''}, zoals bij Licht en screens. Een garagedeur, poort of deur nooit; airco's en cv pas als Smart Climate mag regelen.</p>` : ''}
    ${luisteren()}`;
}

/** Het wekwoord zoals je het zegt: "he_huis" is "Hé huis". */
const wekwoordNaam = (w) => (w === 'he_huis' ? 'Hé huis' : w.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));

/** Luisteren (besluit 150, schets Wand-Instellingen-Luisteren): de spraakassistent, en of dit scherm luistert. */
function luisteren() {
  const lijst = info.gevonden.spraakassistenten ?? [];
  const p = concept.praten;
  const gekozen = lijst.find((x) => x.id === p.spraak) ?? lijst.find((x) => x.voorkeur) ?? null;
  let hier = false;
  try {
    hier = localStorage.getItem('sc-luisteren') === 'aan';
  } catch {
    hier = false;
  }
  const https = window.isSecureContext;
  const opties = [[null, gekozen && !p.spraak ? `Die van Home Assistant (${gekozen.naam})` : 'Die van Home Assistant'], ...lijst.map((x) => [x.id, x.wekwoord ? `${x.naam} · ${wekwoordNaam(x.wekwoord)}` : x.naam])];
  const melding = !lijst.length
    ? 'Geen spraakassistent gevonden in Home Assistant.'
    : !gekozen?.spraakNaarTekst
      ? 'Deze spraakassistent heeft geen spraak naar tekst. Kies er in Home Assistant Whisper bij (Instellingen › Spraakassistenten).'
      : !gekozen.wekwoord
        ? 'Deze spraakassistent heeft geen wekwoord; de microfoonknop werkt wel. Geef hem in Home Assistant een wekwoord, zoals Hé huis (Instellingen › Spraakassistenten).'
        : '';
  return `<h2 class="kop-2" style="margin-top: 8px">Luisteren</h2>
    <span class="veldnaam">Spraakassistent uit Home Assistant</span>
    ${lijst.length ? keuzes('Spraakassistent', 'spraak', opties, p.spraak) : ''}
    ${gekozen?.wekwoord ? `<p class="mini">Wekwoord: <b>${esc(wekwoordNaam(gekozen.wekwoord))}</b>. Hoe gevoelig hij is, stel je in bij de openWakeWord-add-on.</p>` : ''}
    ${melding ? `<p class="uitleg" style="color: var(--zon)">${esc(melding)}</p>` : ''}
    <span class="veldnaam">Dit scherm luistert naar het wekwoord</span>
    <div class="keuzes" role="group" aria-label="Dit scherm luistert"><button type="button" data-hier="aan" aria-pressed="${hier}" ${https ? '' : 'disabled'}>Aan</button><button type="button" data-hier="uit" aria-pressed="${!hier}">Uit</button></div>
    ${https ? '<p class="mini">Voor de tablet aan de wand. Geldt alleen voor dit scherm. Op een telefoon tik je op de microfoon bij de Assistent.</p>' : '<p class="uitleg" style="color: var(--zon)">De microfoon werkt alleen via https. Dit scherm opent de app via http; open hem via een https-adres.</p>'}
    <p class="mini">Je stem gaat naar Home Assistant in huis, niet naar buiten. Alleen de tekst gaat daarna verder, zoals een getypte zin. Er wordt niets opgenomen of bewaard.</p>`;
}

function weer() {
  const bronnen = info.gevonden.weerbronnen ?? [];
  // Open-Meteo voorop (besluit 130): werkt voor elk huis. De rest onder "Andere bron".
  const meteo = bronnen.find((b) => b.id === 'open-meteo');
  const andere = bronnen.filter((b) => b.id !== 'open-meteo');
  const anderGekozen = concept.weer.bron !== 'open-meteo';
  return `<h2 class="kop-2">Weer</h2>
    ${meteo ? keuzes('Weerbron', 'weerBron', [['open-meteo', 'Open-Meteo, via internet']], concept.weer.bron) : ''}
    <p class="mini">Voor het weer van vandaag en de komende dagen, en wat je panelen dan leveren.</p>
    <details ${anderGekozen ? 'open' : ''}><summary class="mini" style="cursor: pointer; font-weight: 700; color: var(--zacht)">Andere bron</summary>
      <div style="margin-top: 8px">${keuzes('Andere weerbron', 'weerBron', [...andere.map((b) => [b.id, b.naam]), [null, 'Geen']], concept.weer.bron)}</div>
    </details>
    <span class="veldnaam">De verwachting per uur bewaren</span>
    ${keuzes('Verwachting per uur', 'weerUren', [[true, 'Bewaren'], [false, 'Niet bewaren']], concept.weer.uren !== false)}
    <p class="mini">Elk uur de verwachting voor twee dagen: buitentemperatuur, zon en wind. Daarmee leert het huis later de temperatuur in je kamers vooruit te rekenen. Alleen de ligging op ongeveer tien kilometer gaat naar Open-Meteo.</p>`;
}

/** Meldingen (besluit 149): onder welk percentage een batterij of filter een melding geeft. */
const DREMPELS = [[null, 'Nooit'], [5, '5%'], [10, '10%'], [20, '20%'], [30, '30%']];
function meldingen() {
  const m = concept.meldingen;
  return `<h2 class="kop-2">Meldingen</h2>
    <span class="veldnaam">Een batterij is bijna leeg onder</span>
    ${keuzes('Batterij bijna leeg onder', 'drempelBatterij', DREMPELS, m.batterij)}
    <span class="veldnaam">Een filter van een airco is bijna vol onder</span>
    ${keuzes('Filter bijna vol onder', 'drempelFilter', DREMPELS, m.filter)}
    <p class="mini">Dan staat het bij de bel en op Thuis. Bij Onderhoud zie je altijd alle batterijen en filters.</p>`;
}

const NAAST = {
  cameras: ['Zo werkt het', ['De camera staat in de kamer waar hij hangt, bij Thuis', 'Smart Climate kijkt alleen: er gaat niets naar de camera']],
  deurbel: ['Zo werkt de deurbel', ['Wordt er aangebeld, dan toont elke open pagina meteen het beeld', 'Tot je het sluit, of de tijd om is', 'Het scherm aanzetten kan alleen in Fully Kiosk Browser']],
  licht: ['Zo werkt het', ['Bedienen doe je in het huis: tik op een kamer, dan op de lamp of het screen', 'De regeling raakt je lampen en screens niet aan', 'Wat je uitzet, staat niet meer in de app; in Home Assistant blijft het gewoon']],
  scherm: ['Waarom volledig scherm', ['Op de tablet aan de muur alleen je huis', 'Elk apparaat kiest het zelf', 'Met één tik terug in Home Assistant']],
  aod: ['Zo werkt het', ['Overdag de klok, wat het huis doet en het weer', 'Na zonsondergang gedimd, met een donker huis', 'Een tik, "Hé huis" of aanbellen opent de app']],
  uit: ['Zo werkt het', ['In de nacht en als niemand thuis is, gaat het scherm uit als er niemand beweegt', 'Een bewegingsmelder zet het display weer aan', 'In Fully Kiosk gaat het scherm echt uit']],
  praten: ['Zo werkt het', ['Het vaste antwoord blijft de basis: het taalmodel zegt het alleen anders', 'Elk getal moet kloppen met wat het huis meet, anders hoor je het vaste antwoord', '"Stop" stopt een scherm dat beweegt', 'Is het gratis gebruik op, dan werkt bedienen gewoon door']],
  meldingen: ['Zo werkt het', ['Een melding komt bij de bel en op Thuis, met een tik naar het apparaat', 'Is het weer goed, dan schuift de melding naar Eerder', 'Een sensor op 20% doet het vaak nog maanden']],
  weer: ['Waarvoor dit nodig is', ['Het weer van vandaag en de komende dagen', 'Wat je panelen dan naar verwachting leveren', 'Later: de temperatuur per kamer vooruit rekenen']],
};

function delen() {
  if (!info || !concept) return [];
  const f = concept;
  const beelden = f.cameras.aan ? f.cameras.lijst.length : 0;
  const weerNaam = (info.gevonden.weerbronnen ?? []).find((b) => b.id === f.weer.bron)?.naam?.replace(' (via internet)', '') ?? 'geen';
  return [
    { id: 'cameras', titel: "Camera's", zin: f.cameras.aan ? `${beelden} in de app` : 'uit', stand: 'goed' },
    { id: 'deurbel', titel: 'Deurbel', zin: f.deurbel.aan ? `beeld ${f.deurbel.seconden / 60 >= 1 ? `${f.deurbel.seconden / 60} min` : `${f.deurbel.seconden} s`}` : 'uit', stand: f.deurbel.aan && (!f.deurbel.melder || !f.deurbel.camera) ? 'mist' : 'goed' },
    { id: 'licht', titel: 'Licht en screens', zin: info.lichtMogelijk || info.schermMogelijk ? (f.licht.bedienen ? 'bedienen in de app' : 'alleen kijken') : 'alleen kijken', stand: 'goed' },
    { id: 'weer', titel: 'Weer', zin: weerNaam, stand: f.weer.bron ? 'goed' : 'leeg' },
    { id: 'meldingen', titel: 'Meldingen', zin: drempelZin(f.meldingen), stand: 'goed' },
    { id: 'praten', titel: 'Praten met je huis', zin: f.praten.taalmodel ? (info.gevonden.taalmodellen ?? []).find((m) => m.id === f.praten.taalmodel)?.naam ?? 'eigen woorden' : 'vaste zinnen', stand: 'goed' },
    // Weergave (besluit 167): dit scherm, het always-on display en wanneer het scherm uitgaat.
    { kop: 'Weergave' },
    ...(app.inHA() ? [{ id: 'scherm', titel: 'Dit scherm', zin: app.volledigGekozen() ? 'volledig scherm' : 'met de zijbalk', stand: 'goed' }] : []),
    { id: 'aod', titel: 'Always-on display', zin: niemandNu().rustMin > 0 ? `aan, na ${niemandNu().rustMin} min` : 'uit', stand: 'goed' },
    { id: 'uit', titel: 'Scherm uit', zin: niemandNu().nacht ? `${niemandNu().van}–${niemandNu().tot}` : niemandNu().weg ? 'als niemand thuis is' : 'nooit', stand: 'goed' },
  ];
}

function drempelZin(m) {
  const t = (v) => (v == null ? 'nooit' : `onder ${v}%`);
  return m.batterij === m.filter ? t(m.batterij) : `batterij ${t(m.batterij)}, filter ${t(m.filter)}`;
}

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  if (!info || !concept) return;
  const nu = groep.tekenDelen(delen());
  const vorm = { cameras, deurbel, licht, weer, praten, meldingen, scherm, aod, uit: schermUit }[nu]?.() ?? '';
  $$('[data-vorm]').forEach((el) => (el.innerHTML = vorm));
  const [kopje, lijst] = NAAST[nu] ?? NAAST.cameras;
  $$('[data-naast]').forEach((el) => (el.innerHTML = `<div class="glas"><h3>${esc(kopje)}</h3><ul>${lijst.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`));
}

function bewaar() {
  groep.bewaarStraks(async () => {
    const uit = await groep.stuur('api/functies', concept);
    if (uit?.ok) info = uit.antwoord;
    return uit;
  });
}

/* ------------------------------------------------------------ doen */

document.addEventListener('click', (e) => {
  const knop = e.target.closest('button');
  if (!knop || knop.disabled || !concept) return;
  // Weergave (besluit 167): dit scherm, het always-on display, scherm uit.
  if (knop.hasAttribute('data-volledig')) {
    app.zetVolledig(knop.getAttribute('aria-checked') !== 'true');
    return teken();
  }
  const n = niemandNu();
  if (knop.hasAttribute('data-nk-aod')) return bewaarNiemand({ rustMin: n.rustMin > 0 ? 0 : 5 });
  if (knop.dataset.nkRust) return bewaarNiemand({ rustMin: Number(knop.dataset.nkRust) });
  if (knop.hasAttribute('data-nk-nacht')) return bewaarNiemand({ nacht: !n.nacht });
  if (knop.hasAttribute('data-nk-weg')) return bewaarNiemand({ weg: !n.weg });
  if (knop.dataset.nkAan) return bewaarNiemand({ aanMin: Number(knop.dataset.nkAan) });
  if (knop.hasAttribute('data-nk-beweging')) return bewaarNiemand({ melder: n.melder ? null : bewegingsmelders()[0]?.id ?? null });
  if (knop.dataset.inApp) return void inApp(knop.dataset.inApp, knop.getAttribute('aria-pressed') !== 'true');
  // Dit scherm luistert (besluit 150): alleen in deze browser, niet bij de dienst.
  if (knop.dataset.hier) {
    try {
      localStorage.setItem('sc-luisteren', knop.dataset.hier);
    } catch {
      // Dan niet.
    }
    // Aan: meteen beginnen, zonder de pagina te verversen.
    if (knop.dataset.hier === 'aan' && !window.luisteren) {
      const sc = document.createElement('script');
      sc.src = 'luisteren.js';
      document.head.appendChild(sc);
    }
    teken();
    return groep.zegBewaard('ok', knop.dataset.hier === 'aan' ? 'Dit scherm luistert nu naar het wekwoord' : 'Dit scherm luistert niet meer; ververs de pagina');
  }
  // Proberen (besluit 148): één vraag aan het gekozen taalmodel, er verandert niets.
  if (knop.hasAttribute('data-proef') && concept.praten.taalmodel) {
    proef = 'bezig';
    teken();
    void haal(`api/praten/proef?model=${encodeURIComponent(concept.praten.taalmodel)}`).then(
      (r) => ((proef = r), teken()),
      () => ((proef = { vast: 'Het taalmodel gaf geen antwoord.', eigen: null }), teken()),
    );
    return;
  }
  if (knop.dataset.kies) {
    const w = JSON.parse(knop.dataset.waarde);
    const s = knop.dataset.kies;
    if (s === 'camerasAan') concept.cameras.aan = w;
    else if (s === 'belAan') {
      concept.deurbel.aan = w;
      // Aanzetten zonder keuze: de eerste deurbel, met zijn eigen camera.
      if (w && !concept.deurbel.melder) {
        const m = info.gevonden.melders[0];
        concept.deurbel.melder = m?.id ?? null;
        concept.deurbel.camera ??= m?.camera ?? null;
      }
    } else if (s === 'schermAan') concept.deurbel.schermAan = w;
    else if (s === 'lichtAan') concept.licht.bedienen = w;
    else if (s === 'schermenAan') concept.schermen.bedienen = w;
    else if (s === 'weerBron') concept.weer.bron = w;
    else if (s === 'weerUren') concept.weer.uren = w;
    else if (s === 'taalmodel') {
      concept.praten.taalmodel = w;
      proef = null;
    } else if (s === 'pratenBedienen') concept.praten.bedienen = w;
    else if (s === 'spraak') concept.praten.spraak = w;
    else if (s === 'seconden') concept.deurbel.seconden = w;
    else if (s === 'drempelBatterij') concept.meldingen.batterij = w;
    else if (s === 'drempelFilter') concept.meldingen.filter = w;
    else if (s.startsWith('camera:')) {
      // Per camera één beeld: het andere beeld van dezelfde camera gaat eruit.
      const c = info.gevonden.cameras[Number(s.slice(7))];
      const anders = new Set(c.beelden.map((b) => b.id));
      concept.cameras.lijst = concept.cameras.lijst.filter((id) => !anders.has(id));
      if (w) concept.cameras.lijst.push(w);
    }
    teken();
    // Een deurbel aan zonder melder of beeld kan de dienst niet bewaren: eerst kiezen.
    if (concept.deurbel.aan && (!concept.deurbel.melder || !concept.deurbel.camera)) return groep.zegBewaard('fout', 'Kies de melder en het beeld van de deurbel');
    bewaar();
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches?.('[data-nk-melder]')) return bewaarNiemand({ melder: t.value });
  if (t.matches?.('[data-nk-van], [data-nk-tot]') && /^\d\d:\d\d$/.test(t.value)) return bewaarNiemand({ [t.matches('[data-nk-van]') ? 'van' : 'tot']: t.value });
  const veld = e.target.closest('[data-veld]');

  if (!veld || !concept) return;
  const v = veld.value || null;
  if (veld.dataset.veld === 'melder') {
    concept.deurbel.melder = v;
    // Een melder met een eigen camera neemt die mee, als er nog geen beeld gekozen is.
    const m = info.gevonden.melders.find((x) => x.id === v);
    if (m?.camera && !concept.deurbel.camera) concept.deurbel.camera = m.camera;
  } else if (veld.dataset.veld === 'camera') concept.deurbel.camera = v;
  teken();
  if (concept.deurbel.aan && (!concept.deurbel.melder || !concept.deurbel.camera)) return groep.zegBewaard('fout', 'Kies de melder en het beeld van de deurbel');
  bewaar();
});

/* ------------------------------------------------------------ starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
addEventListener('hashchange', teken);

app.start('instellingen');
void laad();
