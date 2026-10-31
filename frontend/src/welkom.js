/*
 * De eerste inlog (besluit 147, schets Wand-Eerste-inlog). De dienst stuurt je
 * hierheen na je eerste inlog:
 *
 * - #welkom: je bent bewoner geworden. Je naam bevestigen, en zien hoe het huis
 *   weet of je thuis bent.
 * - #gast: je account heeft geen persoon in Home Assistant, en er woont al
 *   iemand (besluit 151). Je kijkt mee als gast; de hoofdgebruiker kan je
 *   bewoner maken. Is dit een tablet zoals de wand, dan kies je dat hier zelf.
 * - #vraag: het allereerste account, zonder persoon in Home Assistant. Woon je
 *   hier, of is dit een scherm? Wie hier woont, kiest daarna wat hem volgt.
 *
 * Daarna gaat het verder naar waar je heen wilde (`?terug=`).
 */
'use strict';

const { esc, haal } = app;

// Een pad op deze dienst, of achter Ingress een pagina naast deze (besluit 154): nooit een andere site.
const terug = (() => {
  const pad = new URLSearchParams(location.search).get('terug') || 'thuis.html';
  return (pad.startsWith('/') && !pad.startsWith('//')) || /^[a-z-]+\.html([?#][^/\\]*)?$/.test(pad) ? pad : 'thuis.html';
})();
const kaart = document.querySelector('[data-kaart]');
let bewoners = null;
let stap = ['vraag', 'gast'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'welkom';
let keuze = null;
let bron = null;

const merk = '<span class="merk"><i aria-hidden="true"></i>SunArc</span>';
const ICOON_IK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
const ICOON_SCHERM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';

async function stuur(body) {
  const res = await fetch('api/bewoners', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.fout ?? t('toegang.lukteNiet'));
  bewoners = data;
  return data;
}

function fout(tekst) {
  const el = kaart.querySelector('[data-fout]');
  if (el) el.textContent = tekst;
}

function welkom() {
  const ik = bewoners?.bewoners.find((b) => b.ik);
  if (!ik) return vraag();
  const hoofd = bewoners.bewoners.find((b) => b.hoofd);
  const comfort = ik.hoofd ? t('welkom.hoofd') : t('welkom.woont', { naam: hoofd?.naam ?? t('jij.deHoofdgebruiker') });
  const thuis = ik.aanwezigheidNaam
    ? `<div class="bron" aria-pressed="true" style="cursor: default">${esc(ik.gekoppeld ? t('bewoners.inHANaam', { naam: ik.aanwezigheidNaam }) : ik.aanwezigheidNaam)}<span class="${ik.thuis ? 'thuis' : ''}">${ik.thuis == null ? '' : esc(t(ik.thuis ? 'bewoners.thuis' : 'bewoners.weg'))}</span></div>${ik.gekoppeld ? `<span class="hint">${esc(t('bewoners.gekoppeld.ik'))}</span>` : ''}`
    : `<p class="hint">${esc(t('welkom.nogNiet'))}</p>`;
  // Klopt iets niet (besluit 158): per regel waar je het verandert.
  const nietGoed = [
    t(ik.hoofd ? 'welkom.nietHoofd' : 'welkom.wieHoofd'),
    ik.gekoppeld ? t('welkom.verkeerdPersoon', { naam: ik.aanwezigheidNaam ?? '' }) : t('welkom.verkeerdSensor'),
  ];
  kaart.innerHTML = `${merk}
    <h1>${esc(t('welkom.kop', { naam: ik.naam }))}</h1>
    <p>${esc(comfort)}</p>
    <div class="vak"><label for="naam">${esc(t('bewoners.noemt.ik'))}</label><input class="veld" id="naam" data-naam value="${esc(ik.naam)}" maxlength="40" autocomplete="nickname"><span class="hint">${esc(t('welkom.uitHA', { naam: ik.haNaam }))}</span></div>
    <div class="vak"><span>${esc(t('bewoners.thuisVolgens'))}</span>${thuis}</div>
    <span class="fout" data-fout></span>
    <div class="voet"><a class="zacht" href="${esc(terug)}">${esc(t('basis.versie.later'))}</a><button type="button" class="knop knop-licht" data-klopt>${esc(t('welkom.klopt'))}</button></div>
    <details class="nietgoed"><summary>${esc(t('welkom.kloptNiet'))}</summary>${nietGoed.map((z) => `<p class="hint">${esc(z)}</p>`).join('')}<a class="knop" href="bewoners.html">${esc(t('toegang.naarBewoners'))}</a></details>
    <p class="hint" style="margin: 0">${esc(t('welkom.tablet'))} <button type="button" class="zacht" data-wordt-scherm style="font-size: 12.5px; color: var(--ijs-t); padding: 0">${esc(t('welkom.scherm'))}</button></p>`;
}

/** Een gast (besluit 151): kijkt mee, tot de hoofdgebruiker er een bewoner van maakt. */
function gast() {
  const hoofd = bewoners?.bewoners.find((b) => b.hoofd);
  kaart.innerHTML = `${merk}
    <h1>${esc(t('instellingen.gast'))}</h1>
    <p>${esc(t('welkom.gastZin'))}</p>
    <p class="hint" style="margin: 0">${esc(t('welkom.vraagHoofd', { naam: hoofd?.naam ?? t('jij.deHoofdgebruiker') }))}</p>
    <span class="fout" data-fout></span>
    <div class="voet"><span></span><a class="knop knop-licht" href="${esc(terug)}" style="display: inline-flex; align-items: center; text-decoration: none">${esc(t('begin.verder'))}</a></div>
    <p class="hint" style="margin: 0">${esc(t('welkom.tablet'))} <button type="button" class="zacht" data-wordt-scherm style="font-size: 12.5px; color: var(--ijs-t); padding: 0">${esc(t('welkom.scherm'))}</button></p>`;
}

function vraag() {
  kaart.innerHTML = `${merk}
    <h1>${esc(t('welkom.vraag'))}</h1>
    <button type="button" class="keus" data-keus="bewoner" aria-pressed="${keuze === 'bewoner'}"><span class="ik">${ICOON_IK}</span><span><b>${esc(t('welkom.ikWoon'))}</b><span>${esc(t('welkom.ikWoonZin'))}</span></span></button>
    <button type="button" class="keus" data-keus="scherm" aria-pressed="${keuze === 'scherm'}"><span class="ik">${ICOON_SCHERM}</span><span><b>${esc(t('welkom.scherm'))}</b><span>${esc(t('welkom.schermZin'))}</span></span></button>
    <span class="fout" data-fout></span>
    <div class="voet"><span></span><button type="button" class="knop knop-licht" data-verder ${keuze ? '' : 'disabled'}>${esc(t('begin.verder'))}</button></div>`;
}

function waarThuis() {
  // Wat jou kan volgen: geen persoon van een ander account, en niets wat al bij een ander hoort.
  const vrij = bewoners?.kiesbaarVoorMij ?? [];
  const knop = (id, naam, rechts, klasse = '') => `<button type="button" class="bron" data-bron="${esc(id)}" aria-pressed="${bron === id}">${esc(naam)}<span class="${klasse}">${esc(rechts)}</span></button>`;
  kaart.innerHTML = `${merk}
    <h1>${esc(t('bewoners.welkeSensor.ik'))}</h1>
    <p>${esc(t('welkom.sensorZin'))}</p>
    ${vrij.map((b) => knop(b.id, b.naam, `${t(b.soort === 'persoon' ? 'inr.persoon' : 'bewoners.sensor')}${b.thuis == null ? '' : t(b.thuis ? 'toegang.thuis' : 'toegang.weg')}`, b.thuis ? 'thuis' : '')).join('')}
    ${knop('', t('welkom.nogNietKnop'), t('welkom.alleenNaam'))}
    <span class="fout" data-fout></span>
    <div class="voet"><button type="button" class="zacht" data-terug-vraag>${esc(t('panelen.terug'))}</button><button type="button" class="knop knop-licht" data-klaar>${esc(t('algemeen.klaar'))}</button></div>`;
}

function teken() {
  if (stap === 'vraag') vraag();
  else if (stap === 'gast') gast();
  else if (stap === 'thuis') waarThuis();
  else welkom();
}

kaart.addEventListener('click', async (e) => {
  const el = e.target.closest('button');
  if (!el) return;
  try {
    if (el.dataset.keus) {
      keuze = el.dataset.keus;
      vraag();
    } else if (el.hasAttribute('data-verder')) {
      if (keuze === 'scherm') {
        await stuur({ actie: 'ik', soort: 'scherm' });
        location.href = terug;
      } else {
        stap = 'thuis';
        teken();
      }
    } else if (el.hasAttribute('data-terug-vraag')) {
      stap = 'vraag';
      teken();
    } else if (el.dataset.bron !== undefined) {
      bron = el.dataset.bron;
      waarThuis();
    } else if (el.hasAttribute('data-klaar')) {
      await stuur({ actie: 'ik', soort: 'bewoner', ...(bron ? { aanwezigheid: bron } : {}) });
      stap = 'welkom';
      teken();
    } else if (el.hasAttribute('data-wordt-scherm')) {
      await stuur({ actie: 'scherm' });
      location.href = terug;
    } else if (el.hasAttribute('data-klopt')) {
      const ik = bewoners?.bewoners.find((b) => b.ik);
      const naam = kaart.querySelector('[data-naam]')?.value.trim();
      if (ik && naam && naam !== ik.naam) await stuur({ actie: 'naam', id: ik.id, naam });
      location.href = terug;
    }
  } catch (err) {
    fout(err.message);
  }
});

(async () => {
  try {
    bewoners = await haal('api/bewoners');
  } catch {
    // Zonder bewoners (geen logmap): gewoon verder.
    location.href = terug;
    return;
  }
  if (bewoners.ik.soort === 'scherm') {
    location.href = terug;
    return;
  }
  if (bewoners.ik.soort === 'gast') stap = 'gast';
  else if (bewoners.ik.soort === 'onbekend') stap = 'vraag';
  teken();
})();
