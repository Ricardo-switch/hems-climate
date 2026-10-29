/**
 * De woordzoeker van de assistent (besluit 115): een vraag in eigen woorden
 * wordt een vaste vraag over het huis, een verwijzing in de app, of een paar
 * voorbeelden.
 */

import { describe, expect, it } from 'vitest';

import { exampleSite } from './site.js';
import { afsluiter, begrijp, gewoon, isRuis, MAX_TEKST } from '../src/web/woordzoeker.js';

const config = exampleSite;

function app(tekst: string) {
  const b = begrijp(tekst, config, 'nl');
  return b.soort === 'app' ? b.link.href : b.soort;
}

function huis(tekst: string) {
  const b = begrijp(tekst, config, 'nl');
  return b.soort === 'huis' ? b.vraag : b.soort;
}

describe('woordzoeker in het Engels (besluit 185, stap 9 deel 6)', () => {
  const en = (tekst: string) => {
    const b = begrijp(tekst, config, 'en');
    return b.soort === 'huis' ? b.vraag : b.soort === 'app' ? b.link.href : b.soort;
  };

  it('verstaat vragen over het huis', () => {
    expect(en('What are you doing right now?')).toEqual({ kind: 'nu' });
    expect(en('Why is it so hot in the zolder?')).toEqual({ kind: 'waarom', kamer: 'zolder' });
    // Een kamer met een andere naam (29 oktober 2026): de woonkamer als living room, de zolder als attic.
    expect(en('How warm is the living room?')).toEqual({ kind: 'waarom', kamer: 'woonkamer' });
    expect(en('Why is it so cold in the attic?')).toEqual({ kind: 'waarom', kamer: 'zolder' });
    expect(en('Cool the bathroom')).toEqual({ kind: 'doe', kamer: 'badkamer', wens: 'koelen', temperatuurC: null });
    expect(en('Cool the zolder to 22 degrees')).toEqual({ kind: 'doe', kamer: 'zolder', wens: 'koelen', temperatuurC: 22 });
    expect(en('Please warm up the badkamer')).toEqual({ kind: 'doe', kamer: 'badkamer', wens: 'verwarmen', temperatuurC: null });
    expect(en('Switch off the woonkamer')).toEqual({ kind: 'doe', kamer: 'woonkamer', wens: 'uit', temperatuurC: null });
    expect(en('How warm is it everywhere?')).toEqual({ kind: 'warm' });
    // Nieuw op 29 oktober 2026.
    expect(en('Turn on the air conditioner')).toEqual({ kind: 'doe', kamer: '', wens: 'aan', temperatuurC: null });
    expect(en('Is anyone home?')).toEqual({ kind: 'thuis' });
    expect(en('How much did we feed back to the grid today?')).toEqual({ kind: 'terug' });
    expect(en('Is the dryer still running?')).toEqual({ kind: 'draait', apparaat: 'dryer' });
    expect(en('What is the weather tomorrow?')).toEqual({ kind: 'morgen' });
    expect(en('Will it rain today?')).toEqual({ kind: 'weer' });
    expect(en('How much do the air conditioners cost?')).toEqual({ kind: 'kosten' });
    expect(en('How much solar did we generate today?')).toEqual({ kind: 'zon' });
    expect(en('What did you do today?')).toEqual({ kind: 'vandaag' });
    expect(en('What are you going to do tonight?')).toEqual({ kind: 'straks' });
  });

  it('verstaat vragen over de app, met de namen zoals de Engelse app ze toont', () => {
    expect(en('Where do I enter the prices?')).toBe('energie.html#prijzen');
    expect(en('How do I add a floor?')).toBe('indeling.html');
    expect(en('Where can I set my main fuse?')).toBe('energie.html#aansluiting');
    expect(en('How do I sign out?')).toBe('toegang.html');
    expect(en('Where are the cameras?')).toBe('functies.html');
    const b = begrijp('Where do I change the layout?', config, 'en');
    expect(b.soort === 'app' && b.link.label).toBe('Go to Rooms and layout');
  });

  it('geeft Engelse voorbeelden die het zelf verstaat', () => {
    const b = begrijp('blah blah', config, 'en');
    expect(b.soort).toBe('onbekend');
    if (b.soort !== 'onbekend') return;
    for (const v of b.voorbeelden) expect(en(v), v).not.toBe('onbekend');
  });
});

describe('woordzoeker', () => {
  it('ziet ruis als niets gezegd (21 oktober 2026)', () => {
    for (const t of ['(noise)', '[Muziek]', 'noise', ' ... ', '*hoest*', 'Ondertiteld door de Amara.org gemeenschap', 'Bedankt voor het kijken!', '[BLANK_AUDIO]']) expect(isRuis(t), t).toBe(true);
    for (const t of ['Hoe warm is het boven?', 'bedankt', 'zet het licht aan']) expect(isRuis(t), t).toBe(false);
  });

  it('sluit het gesprek af met oké bedankt of dat was het (21 oktober 2026)', () => {
    expect(afsluiter('Oké, bedankt!', 'nl')).toBe('Graag gedaan.');
    expect(afsluiter('dank je wel huis', 'nl')).toBe('Graag gedaan.');
    expect(afsluiter('Dat was het.', 'nl')).toBe('Prima. Ik ben er als je me nodig hebt.');
    expect(afsluiter('Nee, dank je', 'nl')).toBe('Graag gedaan.');
    expect(afsluiter('oké', 'nl')).toBe('Prima. Ik ben er als je me nodig hebt.');
    expect(afsluiter('Welterusten', 'nl')).toBe('Welterusten.');
    expect(afsluiter('Oké, doe het licht uit', 'nl')).toBeNull();
    expect(afsluiter('stop', 'nl')).toBeNull();
    expect(afsluiter('Hoe warm is het boven?', 'nl')).toBeNull();
  });

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
    // Hardop noemt de zin zelf twee voorbeelden (besluit 166).
    expect(b.gesproken).toBe('Dat begrijp ik nog niet. Vraag bijvoorbeeld "Wat doe je nu" of "Hoe warm is het overal".');
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

  it('herkent het weer van morgen en wat iets kost (besluit 142)', () => {
    // "Morgen" ging eerst naar wat het huis straks doet (opgelost 15 oktober).
    expect(huis('Gaat het morgen regenen?')).toEqual({ kind: 'morgen' });
    expect(huis('Hoe wordt het weer morgen')).toEqual({ kind: 'morgen' });
    // Zonder morgen gaat het weer over vandaag (besluit 166).
    expect(huis('Wat voor weer wordt het vandaag?')).toEqual({ kind: 'weer' });
    expect(huis('Gaat het regenen?')).toEqual({ kind: 'weer' });
    expect(huis('Wat ga je straks doen')).toEqual({ kind: 'straks' });
    expect(huis('Wat kost de airco?')).toEqual({ kind: 'kosten' });
    expect(huis('Hoeveel geld kostte de airco deze maand')).toEqual({ kind: 'kosten' });
    expect(app('Waar komt het weer vandaan?')).toBe('functies.html');
  });
});

describe('nieuwe vragen (29 oktober 2026)', () => {
  it('zet de airco aan zonder kamer, maar laat licht aan de opdrachten', () => {
    expect(huis('Zet de airco aan')).toEqual({ kind: 'doe', kamer: '', wens: 'aan', temperatuurC: null });
    expect(huis('Zet de verwarming op zolder aan')).toEqual({ kind: 'doe', kamer: 'zolder', wens: 'verwarmen', temperatuurC: null });
    expect(huis('Zet de airco op zolder aan')).toEqual({ kind: 'doe', kamer: 'zolder', wens: 'aan', temperatuurC: null });
    expect(huis('Zet het licht in de woonkamer aan')).not.toMatchObject({ kind: 'doe' });
    expect(huis('Doe de lampen uit')).not.toMatchObject({ kind: 'doe' });
    expect(huis('Waarom staat de airco aan?')).toEqual({ kind: 'nu' });
  });

  it('verstaat thuis, teruggeleverd en of een apparaat draait', () => {
    expect(huis('Is er iemand thuis?')).toEqual({ kind: 'thuis' });
    expect(huis('Wie is er thuis?')).toEqual({ kind: 'thuis' });
    expect(huis('Hoeveel heb ik vandaag teruggeleverd?')).toEqual({ kind: 'terug' });
    expect(huis('Draait de wasmachine nog?')).toEqual({ kind: 'draait', apparaat: 'wasmachine' });
    expect(huis('Is de droger klaar?')).toEqual({ kind: 'draait', apparaat: 'droger' });
    // Wat iets kost, blijft kosten.
    expect(huis('Wat kost de wasmachine?')).toEqual({ kind: 'kosten' });
    expect(huis('Wat kost de stroom deze maand?')).toEqual({ kind: 'kosten' });
  });
});
