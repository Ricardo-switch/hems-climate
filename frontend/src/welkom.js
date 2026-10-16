/*
 * De eerste inlog (besluit 147, schets Wand-Eerste-inlog). De dienst stuurt je
 * hierheen na je eerste inlog:
 *
 * - #welkom: je bent bewoner geworden. Je naam bevestigen, en zien hoe het huis
 *   weet of je thuis bent.
 * - #vraag: je account heeft geen persoon in Home Assistant. Woon je hier, of
 *   is dit een scherm zoals de wand? Wie hier woont, kiest daarna wat hem volgt.
 *
 * Daarna gaat het verder naar waar je heen wilde (`?terug=`).
 */
'use strict';

const { esc, haal } = app;

const terug = (() => {
  const t = new URLSearchParams(location.search).get('terug') || '/thuis.html';
  return t.startsWith('/') && !t.startsWith('//') ? t : '/thuis.html';
})();
const kaart = document.querySelector('[data-kaart]');
let bewoners = null;
let stap = location.hash.slice(1) === 'vraag' ? 'vraag' : 'welkom';
let keuze = null;
let bron = null;

const merk = '<span class="merk"><i aria-hidden="true"></i>Smart Climate</span>';
const ICOON_IK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
const ICOON_SCHERM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';

async function stuur(body) {
  const res = await fetch('api/bewoners', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.fout ?? 'dat lukte niet');
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
  const comfort = ik.hoofd
    ? 'Je bent de hoofdgebruiker: jouw comfort geldt als je thuis bent, en als er niemand thuis is.'
    : `Je woont hier. Je comfort is eerst hetzelfde als dat van ${esc(hoofd?.naam ?? 'de hoofdgebruiker')}, tot je zelf iets verandert.`;
  const thuis = ik.aanwezigheidNaam
    ? `<div class="bron" aria-pressed="true" style="cursor: default">${esc(ik.aanwezigheidNaam)}<span class="${ik.thuis ? 'thuis' : ''}">${ik.thuis == null ? '' : ik.thuis ? 'thuis' : 'weg'}</span></div>`
    : '<p class="hint">Nog niet bekend. Kies het later bij Instellingen › Bewoners.</p>';
  kaart.innerHTML = `${merk}
    <h1>Welkom, ${esc(ik.naam)}</h1>
    <p>${comfort}</p>
    <div class="vak"><label for="naam">Zo noemt het huis je</label><input class="veld" id="naam" data-naam value="${esc(ik.naam)}" maxlength="40" autocomplete="nickname"><span class="hint">Uit Home Assistant: ${esc(ik.haNaam)}. Hier veranderen verandert niets in Home Assistant.</span></div>
    <div class="vak"><span>Thuis volgens</span>${thuis}</div>
    <span class="fout" data-fout></span>
    <div class="voet"><a class="zacht" href="${esc(terug)}">Later</a><button type="button" class="knop knop-licht" data-klopt>Klopt</button></div>
    <p class="hint" style="margin: 0">Is dit geen persoon maar een tablet, zoals de wand? <button type="button" class="zacht" data-wordt-scherm style="font-size: 12.5px; color: var(--ijs); padding: 0">Dit is een scherm</button></p>`;
}

function vraag() {
  kaart.innerHTML = `${merk}
    <h1>Woon je hier, of is dit een scherm?</h1>
    <button type="button" class="keus" data-keus="bewoner" aria-pressed="${keuze === 'bewoner'}"><span class="ik">${ICOON_IK}</span><span><b>Ik woon hier</b><span>Met je eigen naam, en je eigen comfort als je dat wilt.</span></span></button>
    <button type="button" class="keus" data-keus="scherm" aria-pressed="${keuze === 'scherm'}"><span class="ik">${ICOON_SCHERM}</span><span><b>Dit is een scherm</b><span>Zoals de wand of een tablet in de keuken. Begroet wie er thuis is, en telt niet als bewoner.</span></span></button>
    <span class="fout" data-fout></span>
    <div class="voet"><span></span><button type="button" class="knop knop-licht" data-verder ${keuze ? '' : 'disabled'}>Verder</button></div>`;
}

function waarThuis() {
  const vrij = (bewoners?.bronnen ?? []).filter((b) => b.van == null);
  const knop = (id, naam, rechts, klasse = '') => `<button type="button" class="bron" data-bron="${esc(id)}" aria-pressed="${bron === id}">${esc(naam)}<span class="${klasse}">${esc(rechts)}</span></button>`;
  kaart.innerHTML = `${merk}
    <h1>Hoe weet het huis of je thuis bent?</h1>
    <p>Kies wat jou volgt. Zo weet het huis wiens comfort er geldt. Wat al bij een andere bewoner hoort, staat er niet bij.</p>
    ${vrij.map((b) => knop(b.id, b.naam, b.thuis == null ? '' : b.thuis ? 'thuis' : 'weg', b.thuis ? 'thuis' : '')).join('')}
    ${knop('', 'Nog niet', 'dan telt alleen je naam')}
    <span class="fout" data-fout></span>
    <div class="voet"><button type="button" class="zacht" data-terug-vraag>Terug</button><button type="button" class="knop knop-licht" data-klaar>Klaar</button></div>`;
}

function teken() {
  if (stap === 'vraag') vraag();
  else if (stap === 'thuis') waarThuis();
  else welkom();
}

kaart.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  try {
    if (t.dataset.keus) {
      keuze = t.dataset.keus;
      vraag();
    } else if (t.hasAttribute('data-verder')) {
      if (keuze === 'scherm') {
        await stuur({ actie: 'ik', soort: 'scherm' });
        location.href = terug;
      } else {
        stap = 'thuis';
        teken();
      }
    } else if (t.hasAttribute('data-terug-vraag')) {
      stap = 'vraag';
      teken();
    } else if (t.dataset.bron !== undefined) {
      bron = t.dataset.bron;
      waarThuis();
    } else if (t.hasAttribute('data-klaar')) {
      await stuur({ actie: 'ik', soort: 'bewoner', ...(bron ? { aanwezigheid: bron } : {}) });
      stap = 'welkom';
      teken();
    } else if (t.hasAttribute('data-wordt-scherm')) {
      await stuur({ actie: 'scherm' });
      location.href = terug;
    } else if (t.hasAttribute('data-klopt')) {
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
  if (bewoners.ik.soort === 'onbekend') stap = 'vraag';
  teken();
})();
