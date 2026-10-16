/*
 * Bewoners (besluit 147, schets Wand-Bewoners). Wie hier woont, op volgorde:
 * de eerste die thuis is, bepaalt het comfort; de hoofdgebruiker staat
 * bovenaan. Je eigen naam, wat je thuis volgt en je comfort zet je zelf; de
 * hoofdgebruiker en een beheerder kunnen dat ook voor een ander, en zetten de
 * volgorde. Alles gaat meteen naar de dienst, nooit naar Home Assistant.
 */
'use strict';

const { $$, esc, haal } = app;

let data = null;
let zon = null;
/** De volgorde tijdens het slepen, voordat hij bewaard is. */
let sleepVolgorde = null;

const KLEUREN = ['#6fd3ff', '#f7b548', '#6ee7b7', '#8f86ff', '#ff7a4d', '#e7a6ff'];
const kleur = (i) => KLEUREN[i % KLEUREN.length];
const tijd = (ms) => new Date(ms).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
const dag = (ms) => new Date(ms).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });

/** Bewoners en gasten samen, om er een te kiezen. */
const iedereen = () => [...(data?.bewoners ?? []), ...(data?.gasten ?? [])];
function gekozen() {
  const id = decodeURIComponent(location.hash.slice(1));
  return iedereen().find((b) => b.id === id) ?? iedereen().find((b) => b.ik) ?? data?.bewoners[0] ?? data?.gasten?.[0] ?? null;
}
const mag = (b) => data?.ik.magBeheren || b?.ik;

async function stuur(body) {
  const res = await fetch('api/bewoners', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const uit = await res.json().catch(() => ({}));
  if (!res.ok) {
    zeg(uit.fout ?? 'Dat lukte niet.');
    return false;
  }
  data = uit;
  zeg('');
  teken();
  return true;
}
function zeg(tekst) {
  $$('[data-fout]').forEach((el) => (el.textContent = tekst));
}

/* ------------------------------------------------------------ tekenen */

function lijst() {
  const volgorde = sleepVolgorde ?? data.bewoners.map((b) => b.id);
  const nu = gekozen();
  const rijen = volgorde.map((id, i) => {
    const b = data.bewoners.find((x) => x.id === id);
    const onder = [b.hoofd ? 'Hoofdgebruiker' : null, b.hoofd ? 'eigen comfort' : b.comfort === 'eigen' ? 'eigen comfort' : `volgt ${esc(data.bewoners[0]?.naam ?? '')}`].filter(Boolean).join(' · ');
    const thuis = b.thuis == null ? '' : b.thuis ? '<span class="label thuis">thuis</span>' : `<span class="label weg">weg${b.thuisSindsMs ? ` sinds ${tijd(b.thuisSindsMs)}` : ''}</span>`;
    return `<div class="bewoner${b.id === nu?.id ? ' gekozen' : ''}" role="button" tabindex="0" data-kies="${esc(b.id)}" data-rij="${esc(b.id)}">
      <span class="greep" ${data.ik.magBeheren ? `data-greep="${esc(b.id)}" aria-label="${esc(b.naam)} verplaatsen" tabindex="0"` : 'aria-hidden="true" style="visibility: hidden"'}>⋮⋮</span>
      <span class="plek${i === 0 ? ' een' : ''}">${i + 1}</span>
      <span class="gezicht" style="background: ${kleur(data.bewoners.indexOf(b))}">${esc(b.naam.charAt(0).toUpperCase())}</span>
      <span><b>${esc(b.naam)}${b.ik ? ' <span class="mini" style="font-weight: 600">(jij)</span>' : ''}</b><span class="onder">${onder}</span></span>
      <span class="labels">${thuis}${b.geldt ? '<span class="label geldt">geldt nu</span>' : ''}</span>
    </div>`;
  });
  const g = data.geldt;
  const hoofd = data.bewoners[0];
  let uitleg = '';
  if (g) {
    const waarom = g.waarom === 'gekozen'
      ? 'Gekozen op een scherm, tot er iemand thuiskomt of weggaat.'
      : g.waarom === 'niemand'
        ? 'Er is niemand thuis: dan geldt het comfort van de hoofdgebruiker.'
        : g.id === hoofd?.id
          ? `${esc(g.naam)} is thuis.`
          : `${esc(hoofd?.naam ?? 'De hoofdgebruiker')} is weg; ${esc(g.naam)} staat daarna en is thuis.`;
    uitleg = `<p class="uitleg"><b>Nu geldt het comfort van ${esc(g.naam)}.</b> ${waarom} Wisselen gebeurt na tien minuten thuis of weg.</p>`;
  } else if (data.bewoners.length) {
    uitleg = '<p class="uitleg">Het comfort wisselt zodra de regeling het volgende besluit neemt.</p>';
  }
  return rijen.length ? rijen.join('') + uitleg : '<p class="klein" style="margin: 0">Nog niemand. Wie met zijn account van Home Assistant inlogt, komt hier te staan; de eerste wordt hoofdgebruiker.</p>';
}

function blad() {
  const b = gekozen();
  if (!b) return '<p class="klein" style="margin: 0">Kies een bewoner.</p>';
  const kan = mag(b);
  const hoofd = data.bewoners[0];
  const bronnen = data.bronnen.filter((x) => x.van == null || x.id === b.aanwezigheid);
  const thuisHint = b.aanwezigheid ? (b.thuis == null ? 'Het huis weet nu niet of het zo is.' : b.thuis ? `Thuis${b.thuisSindsMs ? ` sinds ${tijd(b.thuisSindsMs)}` : ''}.` : `Weg${b.thuisSindsMs ? ` sinds ${tijd(b.thuisSindsMs)}` : ''}.`) : 'Zonder aanwezigheid telt deze bewoner niet mee bij wie er thuis is.';
  // Bewoner of gast (besluit 147): alleen de hoofdgebruiker kiest, en de hoofdgebruiker zelf is geen gast.
  const soort = data.ik.magBeheren && !b.hoofd
    ? `<div class="vak"><span>Woont hier, of te gast</span><div class="seg" role="group" aria-label="${esc(b.naam)} woont hier of is te gast">
        <button type="button" data-gast="nee" aria-pressed="${!b.gast}">Bewoner</button>
        <button type="button" data-gast="ja" aria-pressed="${b.gast}">Gast</button>
      </div><span class="hint">${b.gast ? 'Een gast kijkt mee, en bedient licht en screens alleen als hij thuis is. Van een gast wordt niets bewaard, en hij telt niet mee voor het comfort.' : 'Een bewoner staat in de volgorde en heeft zijn eigen comfort, of volgt de hoofdgebruiker.'}</span></div>`
    : '';
  if (b.gast) {
    return `<div class="kop"><span class="gezicht" style="background: #9aa8b6">${esc(b.naam.charAt(0).toUpperCase())}</span><div><h2 class="kop-2" style="margin: 0">${esc(b.naam)}</h2><span class="mini">Gast, ingelogd sinds ${esc(dag(b.sindsMs))}</span></div></div>
      <div class="vak"><label for="bron-${esc(b.id)}">Thuis volgens</label><select class="veld" id="bron-${esc(b.id)}" data-bron ${data.ik.magBeheren ? '' : 'disabled'}><option value="">Het huis weet het niet</option>${bronnen.map((x) => `<option value="${esc(x.id)}" ${x.id === b.aanwezigheid ? 'selected' : ''}>${esc(x.naam)}</option>`).join('')}</select><span class="hint">${b.aanwezigheid ? thuisHint : 'Zonder aanwezigheid bedient een gast niets: het huis weet niet of hij thuis is.'}</span></div>
      ${soort}
      <span class="fout" data-fout></span>
      ${data.ik.magBeheren ? '<div class="knoppenrij"><button type="button" class="knop gevaar" data-weg>Weghalen</button></div>' : ''}`;
  }
  const comfort = b.hoofd
    ? '<div class="seg"><button type="button" aria-pressed="true" disabled>Eigen</button></div><span class="hint">De hoofdgebruiker heeft het comfort van het huis. <a href="comfort.html">Bekijk het ›</a></span>'
    : `<div class="seg" role="group" aria-label="Comfort van ${esc(b.naam)}">
        <button type="button" data-comfort="eigen" aria-pressed="${b.comfort === 'eigen'}" ${kan ? '' : 'disabled'}>Eigen</button>
        <button type="button" data-comfort="volgt" aria-pressed="${b.comfort === 'volgt'}" ${kan ? '' : 'disabled'}>Volgt ${esc(hoofd?.naam ?? 'hoofdgebruiker')}</button>
      </div><span class="hint">${b.comfort === 'eigen' ? 'Een eigen comfort.' : `Hetzelfde als ${esc(hoofd?.naam ?? 'de hoofdgebruiker')}, tot er iets verandert.`} <a href="comfort.html?bewoner=${encodeURIComponent(b.id)}">Bekijk ${b.ik ? 'je' : 'het'} comfort ›</a></span>`;
  const knoppen = [
    data.ik.magBeheren && !b.hoofd ? '<button type="button" class="knop" data-hoofd>Hoofdgebruiker maken</button>' : '',
    kan && (!b.hoofd || data.bewoners.length === 1) ? '<button type="button" class="knop gevaar" data-weg>Weghalen</button>' : '',
  ].join('');
  return `<div class="kop"><span class="gezicht" style="background: ${kleur(data.bewoners.indexOf(b))}">${esc(b.naam.charAt(0).toUpperCase())}</span><div><h2 class="kop-2" style="margin: 0">${esc(b.naam)}</h2><span class="mini">Ingelogd sinds ${esc(dag(b.sindsMs))}</span></div></div>
    <div class="vak"><label for="naam-${esc(b.id)}">Zo noemt het huis ${b.ik ? 'je' : esc(b.naam)}</label><input class="veld" id="naam-${esc(b.id)}" data-naam value="${esc(b.naam)}" maxlength="40" ${kan ? '' : 'disabled'}><span class="hint">In Home Assistant: ${esc(b.haNaam)}. Hier veranderen verandert niets in Home Assistant.</span></div>
    <div class="vak"><label for="bron-${esc(b.id)}">Thuis volgens</label><select class="veld" id="bron-${esc(b.id)}" data-bron ${kan ? '' : 'disabled'}><option value="">Het huis weet het niet</option>${bronnen.map((x) => `<option value="${esc(x.id)}" ${x.id === b.aanwezigheid ? 'selected' : ''}>${esc(x.naam)}</option>`).join('')}</select><span class="hint">${thuisHint}</span></div>
    <div class="vak"><span>Comfort</span>${comfort}</div>
    ${soort}
    <span class="fout" data-fout></span>
    ${knoppen ? `<div class="knoppenrij">${knoppen}</div>` : ''}`;
}

function erbij() {
  const adres = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}inloggen.html`;
  let qr = '';
  try {
    const q = window.qrcode(0, 'M');
    q.addData(adres);
    q.make();
    qr = q.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
  } catch {
    qr = '';
  }
  return `<h3>Iemand erbij</h3><div class="erbij"><div class="qr" aria-label="QR-code naar de app">${qr}</div><span class="klein">Laat diegene deze code scannen en één keer inloggen met Home Assistant. Dan staat ${data.bewoners.length ? `hij hier, met het comfort van ${esc(data.bewoners[0].naam)}` : 'hij hier'}. <a href="${esc(adres)}">${esc(adres.replace(/^https?:\/\//, ''))}</a></span></div>`;
}

/* Alleen wat in de app is ingelogd: schermen zoals de wand, en gasten (besluit 147). */
function schermen() {
  const nu = gekozen();
  const r = [
    ...data.schermen.map((s) => `<div class="r"><span class="n">${esc(s.naam)}</span><span>scherm, begroet wie thuis is</span></div>`),
    ...(data.gasten ?? []).map((g) => `<div class="r gastrij${g.id === nu?.id ? ' gekozen' : ''}" role="button" tabindex="0" data-kies="${esc(g.id)}"><span class="n">${esc(g.naam)}${g.ik ? ' (jij)' : ''}</span><span>gast${g.thuis == null ? '' : g.thuis ? ', thuis' : ', weg'}</span></div>`),
  ];
  return `<h3>Schermen en gasten</h3>${r.length ? r.join('') : '<p class="klein" style="margin: 0; color: var(--zacht)">Nog geen schermen of gasten. Een tablet aan de muur logt één keer in en kiest "Dit is een scherm"; een bewoner maak je hier gast.</p>'}`;
}

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, 0);
  if (!data) return;
  // Niet onder de vinger opnieuw opbouwen terwijl iemand een naam typt.
  const actief = document.activeElement;
  if (actief?.matches?.('[data-naam]')) return;
  $$('[data-lijst]').forEach((el) => (el.innerHTML = lijst()));
  $$('[data-blad]').forEach((el) => (el.innerHTML = blad()));
  $$('[data-erbij]').forEach((el) => (el.innerHTML = erbij()));
  $$('[data-schermen]').forEach((el) => (el.innerHTML = schermen()));
}
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);
addEventListener('hashchange', teken);

/* ------------------------------------------------------------ wat je doet */

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-kies]');
  if (!t || !data) return;
  if (t.closest('[data-greep]')) return;
  const b = gekozen();
  if (t.dataset.kies) {
    location.hash = encodeURIComponent(t.dataset.kies);
  } else if (t.dataset.gast && b) {
    await stuur({ actie: 'gast', id: b.id, gast: t.dataset.gast === 'ja' });
  } else if (t.dataset.comfort && b) {
    await stuur({ actie: 'comfort', id: b.id, comfort: t.dataset.comfort });
  } else if (t.hasAttribute('data-hoofd') && b) {
    await stuur({ actie: 'hoofd', id: b.id });
  } else if (t.hasAttribute('data-weg') && b) {
    if (!confirm(`${b.naam} weghalen? Logt ${b.ik ? 'je' : 'hij'} later weer in, dan begint ${b.ik ? 'je' : 'hij'} opnieuw.`)) return;
    if (await stuur({ actie: 'weg', id: b.id })) location.hash = '';
  }
});
document.addEventListener('keydown', (e) => {
  const rij = e.target.closest?.('[data-kies]');
  if (rij && (e.key === 'Enter' || e.key === ' ') && !e.target.closest('[data-greep]')) {
    e.preventDefault();
    location.hash = encodeURIComponent(rij.dataset.kies);
  }
  // Het greepje met de pijltjes: een plek omhoog of omlaag.
  const greep = e.target.closest?.('[data-greep]');
  if (greep && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    const v = data.bewoners.map((x) => x.id);
    const i = v.indexOf(greep.dataset.greep);
    const j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= v.length) return;
    [v[i], v[j]] = [v[j], v[i]];
    void stuur({ actie: 'volgorde', volgorde: v });
  }
});
document.addEventListener('change', async (e) => {
  const t = e.target;
  const b = gekozen();
  if (!b) return;
  if (t.matches('[data-naam]')) {
    const naam = t.value.trim();
    t.blur();
    if (naam && naam !== b.naam) await stuur({ actie: 'naam', id: b.id, naam });
  } else if (t.matches('[data-bron]')) {
    await stuur({ actie: 'aanwezigheid', id: b.id, bron: t.value || null });
  }
});

/* Slepen aan het greepje: de rij schuift mee, loslaten bewaart de volgorde. */
let sleep = null;
document.addEventListener('pointerdown', (e) => {
  const greep = e.target.closest('[data-greep]');
  if (!greep || !data) return;
  e.preventDefault();
  sleep = { id: greep.dataset.greep, lijst: greep.closest('[data-lijst]') };
  sleepVolgorde = data.bewoners.map((b) => b.id);
  greep.setPointerCapture?.(e.pointerId);
});
document.addEventListener('pointermove', (e) => {
  if (!sleep) return;
  const rijen = [...sleep.lijst.querySelectorAll('[data-rij]')];
  const onder = rijen.find((r) => {
    const box = r.getBoundingClientRect();
    return e.clientY >= box.top && e.clientY <= box.bottom;
  });
  if (!onder || onder.dataset.rij === sleep.id) return;
  // Op de plek van de rij onder de vinger.
  const v = sleepVolgorde.filter((id) => id !== sleep.id);
  v.splice(rijen.indexOf(onder), 0, sleep.id);
  sleepVolgorde = v;
  $$('[data-lijst]').forEach((el) => (el.innerHTML = lijst()));
  sleep.lijst.querySelector(`[data-rij="${CSS.escape(sleep.id)}"]`)?.classList.add('sleept');
});
async function loslaten() {
  if (!sleep) return;
  const v = sleepVolgorde;
  sleep = null;
  sleepVolgorde = null;
  if (v && v.join() !== data.bewoners.map((b) => b.id).join()) await stuur({ actie: 'volgorde', volgorde: v });
  else teken();
}
document.addEventListener('pointerup', () => void loslaten());
document.addEventListener('pointercancel', () => void loslaten());

app.start('instellingen');
(async () => {
  const [b, z] = await Promise.allSettled([haal('api/bewoners'), haal('api/zon')]);
  if (b.status === 'fulfilled') data = b.value;
  if (z.status === 'fulfilled') zon = z.value;
  if (!data) $$('[data-lijst]').forEach((el) => (el.innerHTML = '<p class="klein" style="margin: 0">Bewoners kan pas als de dienst een logmap heeft.</p>'));
  teken();
})();
