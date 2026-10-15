/**
 * De woordzoeker van de assistent (besluit 115): een vraag in eigen woorden
 * wordt een vaste vraag over het huis, een verwijzing in de app, of een paar
 * voorbeelden.
 */

import { describe, expect, it } from 'vitest';

import { exampleSite } from './site.js';
import { begrijp, gewoon, MAX_TEKST } from '../src/web/woordzoeker.js';

const config = exampleSite;

function app(tekst: string) {
  const b = begrijp(tekst, config, 'nl');
  return b.soort === 'app' ? b.link.href : b.soort;
}

function huis(tekst: string) {
  const b = begrijp(tekst, config, 'nl');
  return b.soort === 'huis' ? b.vraag : b.soort;
}

describe('woordzoeker', () => {
  it('maakt de tekst gewoon: kleine letters, zonder accenten en leestekens', () => {
    expect(gewoon('  Wáár vul ik de PRIJZEN in?! ')).toBe('waar vul ik de prijzen in');
    expect(gewoon('Koel naar 21,5 graden, graag')).toBe('koel naar 21,5 graden graag');
  });

  it('vindt de pagina bij een vraag over de app', () => {
    expect(app('Waar vul ik de prijzen in?')).toBe('energie.html#prijzen');
    expect(app('Hoe stel ik het daltarief in')).toBe('energie.html#prijzen');
    expect(app('Hoe pas ik de indeling aan?')).toBe('indeling.html');
    expect(app('Hoe voeg ik een etage toe')).toBe('indeling.html');
    expect(app('Waar stel ik mijn hoofdzekering in')).toBe('energie.html#aansluiting');
    // Comfort zet je in de app (besluit 130).
    expect(app('Waar stel ik de temperatuur in?')).toBe('comfort.html');
    // De batterijen, ook als niets bijna leeg is (besluit 131).
    expect(app('Waar zie ik alle batterijen?')).toBe('thuis.html#batterijen');
    expect(app('Hoe zet ik de deurbel aan')).toBe('functies.html');
    expect(app('Welke camera’s zie ik')).toBe('functies.html');
    expect(app('Hoe kan ik inloggen')).toBe('toegang.html');
    expect(app('Hoeveel heb ik bespaard')).toBe('opbrengst.html');
    expect(app('Waar zie ik het verbruik')).toBe('vandaag.html');
    expect(app('Opnieuw inrichten')).toBe('inrichten.html');
  });

  it('geeft bij de app een kort antwoord en een knop, zonder getallen', () => {
    const b = begrijp('waar vul ik de prijzen in', config, 'nl');
    expect(b.soort).toBe('app');
    if (b.soort !== 'app') return;
    expect(b.antwoord).toContain('Contract en prijzen');
    expect(b.link.label).toBe('Naar Contract en prijzen');
    expect(b.antwoord).not.toMatch(/\d/);
  });

  it('maakt van een vraag over het huis een vaste vraag', () => {
    expect(huis('Wat doe je nu?')).toEqual({ kind: 'nu' });
    expect(huis('Wat ga je straks doen')).toEqual({ kind: 'straks' });
    expect(huis('Hoeveel zon komt er vandaag')).toEqual({ kind: 'zon' });
    expect(huis('Waarom de zolder?')).toEqual({ kind: 'waarom', kamer: 'zolder' });
    expect(huis('hoe warm is het op zolder')).toEqual({ kind: 'waarom', kamer: 'zolder' });
    expect(huis('Waarom staat de airco aan')).toEqual({ kind: 'nu' });
  });

  it('kent een wens voor een kamer, met de temperatuur', () => {
    expect(huis('Koel de zolder naar 21,5 graden')).toEqual({ kind: 'doe', kamer: 'zolder', wens: 'koelen', temperatuurC: 21.5 });
    expect(huis('zet de woonkamer uit')).toEqual({ kind: 'doe', kamer: 'woonkamer', wens: 'uit', temperatuurC: null });
    // "Waarom koelt hij niet" is een vraag, geen wens.
    expect(huis('Waarom koelt de zolder niet?')).toEqual({ kind: 'waarom', kamer: 'zolder' });
  });

  it('zegt wat wel kan als het niets herkent', () => {
    const b = begrijp('banaan', config, 'nl');
    expect(b.soort).toBe('onbekend');
    if (b.soort !== 'onbekend') return;
    expect(b.voorbeelden).toContain('Waar vul ik de prijzen in?');
    expect(begrijp('', config, 'nl').soort).toBe('onbekend');
  });

  it('kan ook Engels', () => {
    const b = begrijp('Where do I enter the prices?', config, 'en');
    expect(b.soort === 'app' && b.link).toEqual({ href: 'energie.html#prijzen', label: 'Go to Contract and prices' });
    expect(begrijp('What are you doing now', config, 'en')).toEqual({ soort: 'huis', vraag: { kind: 'nu' } });
  });

  it('leest niet verder dan de grens', () => {
    expect(begrijp(`${'x '.repeat(MAX_TEKST)} prijzen`, config, 'nl').soort).toBe('onbekend');
  });
  it('herkent wat het huis vandaag deed, en hoe warm het overal is (besluit 141)', () => {
    expect(begrijp('Wat heb je vandaag gedaan?', exampleSite, 'nl')).toEqual({ soort: 'huis', vraag: { kind: 'vandaag' } });
    expect(begrijp('Hoe warm is het overal?', exampleSite, 'nl')).toEqual({ soort: 'huis', vraag: { kind: 'warm' } });
  });
});
