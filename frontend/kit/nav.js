/*
 * De navigatie: vijf plekken, op de wand links en op de telefoon onderin.
 *
 * Bedienen gebeurt in het huis zelf (etage, kamer, apparaat); er is geen
 * aparte tab Bediening. Waarom en Plan zijn samen Vandaag. Apparaten (op zon,
 * de auto, de batterij) heeft een eigen tab. Instellen is een tandwiel: op de
 * wand onderaan de balk, op de telefoon rechtsboven op Thuis.
 */
(function (global) {
  'use strict';
  const ICOON = {
    thuis: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
    vandaag: '<path d="M3 17c3-6 6-9 9-9s6 3 9 9"/><path d="M12 3v2M5.6 5.6l1.4 1.4M18.4 5.6 17 7"/><path d="M3 21h18"/>',
    apparaten: '<path d="M13 2 5 13h6l-1 9 8-11h-6z"/>',
    opbrengst: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    assistent: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    instellingen: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  const NAMEN = [
    ['thuis', 'Thuis'],
    ['vandaag', 'Vandaag'],
    ['apparaten', 'Apparaten'],
    ['opbrengst', 'Opbrengst'],
    ['assistent', 'Assistent'],
  ];
  const svg = (id) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICOON[id]}</svg>`;

  /** `links` geeft per plek het adres; zonder staat er "#". */
  function balk(el, actief, links = {}) {
    const href = (id) => links[id] ?? '#';
    el.innerHTML = `<span class="logo" aria-hidden="true"></span>${NAMEN.map(([id, naam]) => `<a href="${href(id)}" ${id === actief ? 'aria-current="page"' : ''}>${svg(id)}${naam}</a>`).join('')}<a href="${href('instellingen')}" class="onder" ${actief === 'instellingen' ? 'aria-current="page"' : ''} aria-label="Instellingen">${svg('instellingen')}</a>`;
  }
  function tabs(el, actief, links = {}) {
    el.innerHTML = NAMEN.map(([id, naam]) => `<a href="${links[id] ?? '#'}" ${id === actief ? 'aria-current="page"' : ''}>${svg(id)}${naam}</a>`).join('');
  }
  global.nav = { balk, tabs, svg };
})(window);
