/*
 * Jij (besluit 181, schets Instellingen-Tel-Jij): alles wat van één bewoner
 * is op één plek. Het thema en je kleur kies je hier; de rest wijst naar waar
 * het al stond: de weergave op Thuis, je comfort bij Comfort, je naam en hoe
 * het huis weet dat je thuis bent bij Bewoners, je gegevens bij Bewoners en
 * toegang. Een scherm of een gast heeft geen profiel.
 */
'use strict';

const { $$, esc, haal, deur } = app;

/** De zes kleuren, in de volgorde waarin bewoners er een krijgen (voorkeuren.ts). */
const KLEUREN = [['lucht', 'Lucht'], ['framboos', 'Framboos'], ['zeegroen', 'Zeegroen'], ['violet', 'Violet'], ['koper', 'Koper'], ['grafiet', 'Grafiet']];
const THEMAS = [['donker', 'Donker'], ['licht', 'Licht'], ['systeem', 'Zoals je telefoon']];
const IK = {
  kleur: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>',
  weergave: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h5"/>',
  letters: '<path d="M4 19 9 5l5 14M5.8 14h6.4M15 19l3-8 3 8M15.8 17h4.4"/>',
  beweging: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  tel: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
  wand: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M9 21h6"/>',
  comfort: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>',
  thuis: '<path d="M4 11 12 4l8 7v9H4z"/><circle cx="12" cy="14" r="2"/>',
  naam: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  downloaden: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
};
const ik = (id) => `<span class="ik"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IK[id]}</svg></span>`;

let v = null;
let b = null;

async function laad() {
  const [vk, bw] = await Promise.allSettled([haal('api/voorkeuren'), haal('api/bewoners')]);
  if (vk.status === 'fulfilled') {
    v = vk.value;
    app.zetThema(v);
  }
  if (bw.status === 'fulfilled') b = bw.value;
  teken();
}

async function bewaar(wat) {
  try {
    const res = await deur('api/voorkeuren', { plek: 'tel', ...wat });
    if (res?.ok) {
      v = await res.json();
      app.zetThema(v);
      if (wat.weergave) app.zetWeergave(v.tel.weergave);
    }
  } catch {
    // De volgende keer.
  }
  teken();
}

const telling = (n, een, meer) => `${n} ${n === 1 ? een : meer}`;
const link = (href, icoon, titel, onder, rechts = '') => `<a class="rij" href="${href}">${ik(icoon)}<b>${esc(titel)}</b><small>${esc(onder)}</small><span class="pijl">${rechts}›</span></a>`;
const knop = (data, icoon, titel, onder, rechts = '') => `<button type="button" class="rij" ${data}>${ik(icoon)}<b>${esc(titel)}</b><small>${esc(onder)}</small><span class="pijl">${rechts}›</span></button>`;
const schakel = (sleutel, icoon, titel, onder, aan) => `<div class="rij">${ik(icoon)}<b>${esc(titel)}</b><small>${esc(onder)}</small><span class="pijl"><button type="button" class="schakel" role="switch" aria-checked="${aan}" aria-label="${esc(titel)}" data-weergave="${sleutel}"></button></span></div>`;

function teken() {
  const mij = b?.ik;
  const wie = mij?.soort === 'bewoner' ? (b.bewoners ?? []).find((x) => x.id === mij.id) : null;
  // Een gast heeft niets dat bewaard wordt; een scherm of een account zonder bewoner alleen hoe de app eruitziet.
  if (!v || mij?.soort === 'gast') {
    const zin = mij?.soort === 'gast' ? 'Je kijkt mee als gast. Van een gast wordt niets bewaard, dus er is geen profiel.' : 'Even laden';
    $$('[data-jij]').forEach((el) => (el.innerHTML = `<section class="glas gast"><h1 class="kop-2">Jij</h1><p class="klein" style="margin: 6px 0 0">${esc(zin)}</p></section>`));
    return;
  }
  const kleurNaam = KLEUREN.find(([k]) => k === v.tel.kleur)?.[1] ?? 'Lucht';
  const themaNaam = THEMAS.find(([t]) => t === v.tel.thema)?.[1] ?? 'Donker';
  const w = v.tel.weergave;
  const uiterlijk = `
    <section class="glas lijst" aria-labelledby="kop-uiterlijk">
      <h2 id="kop-uiterlijk">Hoe de app eruitziet</h2>
      ${knop('data-thema-open', 'kleur', 'Thema en kleur', `${themaNaam} · ${kleurNaam.toLowerCase()}`, '<span class="staal" aria-hidden="true"></span>')}
      ${link('thuis.html#weergave', 'weergave', 'Weergave', w.eenvoudig ? 'Eenvoudig' : 'Uitgebreid')}
      ${schakel('groteLetters', 'letters', 'Grotere letters', 'Alle tekst een maat groter', w.groteLetters)}
      ${schakel('minderBeweging', 'beweging', 'Minder beweging', 'Geen lopende stromen en geen ademende bol', w.minderBeweging)}
    </section>`;
  if (!wie) {
    const zin = mij?.soort === 'scherm'
      ? 'Dit is een scherm, zoals de wand. Het toont de kleur, de kaarten en de favorieten van wiens comfort geldt.'
      : 'Een eigen profiel, met je kleur op de wand en je comfort, heeft wie hier woont en één keer inlogde.';
    $$('[data-jij]').forEach((el) => (el.innerHTML = `<div class="wie"><div><h1 class="kop-1">${mij?.soort === 'scherm' ? 'Dit scherm' : 'Jij'}</h1><small>${esc(zin)}</small></div></div>${uiterlijk}`));
    return;
  }
  const hoofd = (b.bewoners ?? []).find((x) => x.hoofd);
  const thuis = wie.thuis == null ? '' : wie.thuis ? ' · thuis' : ' · weg';
  const comfort = `${wie.geldt ? 'Geldt nu · ' : ''}${wie.comfort === 'eigen' ? 'je eigen temperaturen' : `volgt ${hoofd?.naam ?? 'de hoofdgebruiker'}`}`;
  const html = `
    <div class="wie"><span class="rondje" aria-hidden="true">${esc(wie.naam.charAt(0).toUpperCase())}</span><div><h1 class="kop-1">${esc(wie.naam)}</h1><small>${wie.hoofd ? 'Hoofdgebruiker' : `Bewoner, ${wie.plek}e op de lijst`}${thuis}</small></div></div>
    ${uiterlijk}
    <section class="glas lijst" aria-labelledby="kop-thuis">
      <h2 id="kop-thuis">Thuis</h2>
      ${link('thuis.html', 'tel', 'Kaarten en favorieten', `${telling(v.tel.kaarten.length, 'kaart', 'kaarten')} · ${telling(v.tel.favorieten.length, 'favoriet', 'favorieten')}`)}
      <p class="uitleg">De wand toont jouw kaarten, favorieten en kleur zolang jouw comfort geldt. Wat je hier verandert, staat dan ook op de wand.</p>
    </section>
    <section class="glas lijst" aria-labelledby="kop-comfort">
      <h2 id="kop-comfort">Comfort</h2>
      ${link('comfort.html', 'comfort', 'Jouw comfort', comfort.charAt(0).toUpperCase() + comfort.slice(1))}
      ${link('bewoners.html', 'thuis', 'Thuis volgens', wie.aanwezigheidNaam ?? 'Nog niet gekozen')}
    </section>
    <section class="glas lijst" aria-labelledby="kop-over">
      <h2 id="kop-over">Over jou</h2>
      ${link('bewoners.html', 'naam', 'Je naam', wie.naam)}
      ${link('toegang.html#gegevens', 'downloaden', 'Je gegevens', 'Wat het huis van jou bewaart')}
    </section>`;
  $$('[data-jij]').forEach((el) => (el.innerHTML = html));
  // Staat het blad open, dan alleen de keuze bijwerken: zo blijft de focus waar hij was.
  for (const el of $$('[data-blad] [data-thema]')) el.setAttribute('aria-checked', String(el.dataset.thema === v.tel.thema));
  for (const el of $$('[data-blad] [data-kies-kleur]')) el.setAttribute('aria-checked', String(el.dataset.kiesKleur === v.tel.kleur));
}

/* ------------------------------------------------------------ het blad */

function tekenBlad() {
  const blad = document.querySelector('[data-blad]');
  blad.innerHTML = `
    <div class="bladkop"><h2 class="kop-2" id="bladkop">Thema en kleur</h2><button type="button" class="knop knop-licht" data-blad-dicht>Klaar</button></div>
    <h3 id="kop-thema">Thema</h3>
    <div class="drie" role="radiogroup" aria-labelledby="kop-thema">${THEMAS.map(([t, naam]) => `<button type="button" role="radio" aria-checked="${v.tel.thema === t}" data-thema="${t}"><div class="mini-tel mini-${t}" aria-hidden="true"><i></i><i></i><i></i></div><b>${esc(naam)}</b></button>`).join('')}</div>
    <p class="klein wand-alleen" style="margin: 8px 0 0">Het thema geldt op je telefoon; de wand blijft donker.</p>
    <h3 id="kop-kleur">Jouw kleur</h3>
    <div class="kleuren" role="radiogroup" aria-labelledby="kop-kleur">${KLEUREN.map(([k, naam]) => `<button type="button" role="radio" aria-checked="${v.tel.kleur === k}" data-kies-kleur="${k}"><span data-kleur="${k}" aria-hidden="true"></span>${esc(naam)}</button>`).join('')}</div>
    <p class="betekenis">Ook op de wand, als jouw comfort geldt. <i style="background: var(--ijs)"></i>Blauw, <i style="background: var(--gloed)"></i>oranje, <i style="background: var(--zon)"></i>amber en <i style="background: var(--mint)"></i>groen blijven van het huis: die zeggen wat het huis doet.</p>`;
}

let terugFocus = null;
function openBlad() {
  terugFocus = document.activeElement;
  tekenBlad();
  document.querySelector('[data-achter]').hidden = false;
  const blad = document.querySelector('[data-blad]');
  blad.hidden = false;
  blad.querySelector('[aria-checked="true"]')?.focus();
}
function sluitBlad() {
  document.querySelector('[data-achter]').hidden = true;
  document.querySelector('[data-blad]').hidden = true;
  terugFocus?.focus?.();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-thema-open], [data-blad-dicht], [data-achter], [data-thema], [data-kies-kleur], [data-weergave]');
  if (!t || !v) return;
  if (t.matches('[data-thema-open]')) openBlad();
  else if (t.matches('[data-blad-dicht], [data-achter]')) sluitBlad();
  else if (t.matches('[data-thema]')) void bewaar({ thema: t.dataset.thema });
  else if (t.matches('[data-kies-kleur]')) void bewaar({ kleur: t.dataset.kiesKleur });
  else if (t.matches('[data-weergave]')) void bewaar({ weergave: { [t.dataset.weergave]: t.getAttribute('aria-checked') !== 'true' } });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.querySelector('[data-blad]').hidden) sluitBlad();
});
// Wisselt het thema met de telefoon mee, dan tekent het blad de tinten opnieuw.
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => teken());

app.start('instellingen');
void laad();
