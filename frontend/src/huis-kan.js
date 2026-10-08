/*
 * Wat je huis kan (besluit 104; schets Wand-Huis-groeit). Vier stappen; waar
 * dit huis staat, volgt uit wat het heeft: een airco, panelen, een batterij,
 * een laadpaal. Wat er nog niet is, staat gestippeld.
 */
'use strict';

const { $$, esc, haal } = app;

let site = null;
let zon = null;

async function laadAlles() {
  const [s, z] = await Promise.allSettled([haal('api/site'), haal('api/zon')]);
  if (s.status === 'fulfilled') site = s.value;
  if (z.status === 'fulfilled') zon = z.value;
  teken();
}

function stappen() {
  const airco = (site?.actuators ?? []).some((a) => a.capabilities?.canCool);
  const panelen = (zon?.panelen ?? []).length > 0;
  return [
    { kort: 'Begin', kop: 'Klimaat', heeft: airco || (site?.actuators ?? []).length > 0, kan: [['Elke kamer op temperatuur', true], ['Uitleg bij elk besluit', true], ['Koelen op zon: met panelen', panelen]], nodig: ['Home Assistant en een airco of thermostaat'] },
    { kort: 'Met panelen', kop: 'Op zon', heeft: panelen, kan: [['Koelen en verwarmen op zon', panelen], ['De droger op zon', panelen], ['Opbrengst per apparaat', panelen]], nodig: ['P1-meter', 'zonnesensor'] },
    { kort: 'Met een batterij', kop: 'Ook ’s avonds zon', heeft: false, kan: [['Zon van de middag voor de avond', false], ['Laden als stroom goedkoop is', false], ['Nooit meer dan je zekering', true]], nodig: ['Batterij via Home Assistant'] },
    { kort: 'Met een laadpaal', kop: 'De auto op zon', heeft: false, kan: [['Laden met wat er over is', false], ['Vol op de tijd die jij kiest', false], ['Samen met airco en batterij', false]], nodig: ['Laadpaal via evcc'] },
  ];
}

function teken() {
  app.schaal();
  app.luchtVan(zon, 0);
  const lijst = stappen();
  const nu = lijst.reduce((n, s, i) => (s.heeft ? i : n), 0);
  $$('[data-stap]').forEach((el) => (el.innerHTML = `<span class="stip" style="background: var(--mint)"></span>Jouw huis: stap ${nu + 1}`));
  const tel = app.telStand();
  const box = document.querySelector(tel ? '#tel [data-stappen]' : '#wand [data-stappen]');
  box.innerHTML = lijst
    .map((s, i) => `<section class="glas stap${i === nu ? ' nu' : i > nu ? ' straks' : ''}"><div class="huisje" data-huisje="${i}"></div>
      <span class="mini${i === nu ? ' mint-t' : ''}">${esc(s.kort)}${i === nu ? ', nu' : ''}</span><h2 class="kop-2">${esc(s.kop)}</h2>
      <ul class="kan">${s.kan.map(([t, ja]) => `<li class="${ja ? '' : 'niet'}">${esc(t)}</li>`).join('')}</ul>
      <div class="moeite">${s.nodig.map((n) => `<span class="tag">${esc(n)}</span>`).join('')}</div></section>`)
    .join('');
  const etages = (koelt) => [
    { kamers: [{ naam: 'Woonkamer', stil: true, stand: koelt ? 'koelt' : 'rust', apparaten: [{ soort: 'airco', aan: koelt }, { soort: 'bank' }] }] },
    { kamers: [{ naam: 'Slaapkamer', stil: true, apparaten: [] }] },
  ];
  const opt = { breedte: 300, hoogte: tel ? 220 : 280, marge: 0.02, ruimte: true };
  const zonOp = { stand: 0.5, hoogte: 0.8, aandeel: 0.8 };
  const modellen = [
    { tijd: 'dag', zon: { ...zonOp, aandeel: 0 }, etages: etages(false), buitenunit: { aan: false }, spook: ['panelen'] },
    { tijd: 'dag', zon: zonOp, etages: etages(true), buitenunit: { aan: true }, net: true, spook: ['batterij'], stromen: [{ van: 'zon', naar: 'kamer:Woonkamer', sterkte: 0.6 }] },
    { tijd: 'dag', zon: zonOp, etages: etages(true), buitenunit: { aan: true }, net: true, batterij: { procent: 70, stand: 'laadt' }, spook: ['auto'], stromen: [{ van: 'zon', naar: 'batterij', sterkte: 0.4 }] },
    { tijd: 'dag', zon: zonOp, etages: etages(true), buitenunit: { aan: true }, net: true, batterij: { procent: 70, stand: 'laadt' }, auto: { procent: 60, stand: 'laadt', bron: 'zon', kleur: '#7f97b0' }, stromen: [{ van: 'zon', naar: 'auto', sterkte: 0.5 }] },
  ];
  modellen.forEach((m, i) => huis.teken(box.querySelector(`[data-huisje="${i}"]`), { beschrijving: `Stap ${i + 1}: ${lijst[i].kop}`, ...m }, opt));
}

app.start('instellingen');
addEventListener('resize', () => teken());
void laadAlles();
