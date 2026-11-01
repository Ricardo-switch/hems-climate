/**
 * Het huis: de indeling, het huis zelf, en licht, scènes en schermen bedienen.
 *
 * Geknipt uit server.ts (besluit 180, 23 oktober 2026): letterlijk, met de
 * context `d` in plaats van de webserver zelf.
 */

import { OUTSIDE_FLOOR, floorName, floorOrder, standardFloors } from '../layout.js';
import { readJson, sendJson } from '../http.js';
import { taalVan, type Diensten, type Verzoek } from '../diensten.js';
import { brugVerzoek, totWanneer } from '../klimaatbrug.js';

/** De routes van dit onderwerp; waar als het verzoek hier is afgehandeld. */
export async function huisRoutes(d: Diensten, v: Verzoek): Promise<boolean> {
  const { req, res, url, path, method } = v;
  if (path === '/api/indeling') {
    const door = d.options.layout;
    const taal = taalVan(url.searchParams.get('taal') ?? req.headers['x-taal']);
    const config = d.config();
    if (door == null || config == null) {
      sendJson(res, 503, { wachten: 'indelen staat niet aan' });
      return true;
    }
    if (method === 'POST') {
      let body: unknown;
      try {
        body = await readJson(req);
      } catch (error) {
        sendJson(res, 400, { fout: (error as Error).message });
        return true;
      }
      const result = await door.store.save(body);
      if (result.ok) sendJson(res, 200, result.layout);
      else sendJson(res, result.status, { fout: result.reden });
      return true;
    }
    // Alles wat de bewerkstand nodig heeft om te kiezen, zonder zelf te rekenen.
    sendJson(res, 200, {
      indeling: door.store.current,
      voorstel: door.proposal(),
      // De etages van deze indeling, van boven naar beneden, en buiten (besluit 112);
      // de vaste etages als voorstel om toe te voegen.
      etages: [...floorOrder(door.store.current ?? door.proposal() ?? { kamers: [] }), OUTSIDE_FLOOR].map((id) => ({ id, standaardNaam: floorName(id, taal) })),
      standaard: standardFloors(taal),
      regelzones: config.zones.map((z) => ({ id: z.id, naam: z.name })),
    });
    return true;
  }

  if (path === '/api/huis') {
    const house = d.options.house?.(taalVan(url.searchParams.get('taal') ?? req.headers['x-taal'])) ?? null;
    if (house == null) {
      sendJson(res, 503, { wachten: 'de etages en ruimtes komen van Home Assistant zodra die verbonden is' });
      return true;
    }
    // Of de knoppen voor licht echt schakelen, of zeggen dat het nog niet mag.
    sendJson(res, 200, { ...house, lichtBedienen: d.lichtMag(), schermenBedienen: d.schermMag() });
    return true;
  }

  if (path === '/api/scene') {
    const lights = d.options.lights;
    if (lights == null || !lights.scenesEnabled || !d.lichtMag()) {
      sendJson(res, 503, { wachten: 'scènes staan niet aan' });
      return true;
    }
    if (method !== 'POST') {
      sendJson(res, 405, { fout: 'een scène zet je aan met een POST' });
      return true;
    }
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { fout: (error as Error).message });
      return true;
    }
    const result = await lights.scene(body);
    if (result.ok) sendJson(res, 200, { aan: true });
    else sendJson(res, result.status, { fout: result.reden });
    return true;
  }

  if (path === '/api/scherm') {
    const covers = d.options.covers;
    if (covers == null || !d.schermMag()) {
      sendJson(res, 503, { wachten: 'schermen bedienen staat niet aan' });
      return true;
    }
    if (method !== 'POST') {
      sendJson(res, 405, { fout: 'een scherm bedien je met een POST' });
      return true;
    }
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { fout: (error as Error).message });
      return true;
    }
    const result = await covers.move(body);
    if (result.ok) sendJson(res, 200, { ok: true });
    else sendJson(res, result.status, { fout: result.reden });
    return true;
  }

  /*
   * Klimaat met de hand (besluit 235): GET wat er kan, per apparaat en per
   * stekker; POST een doel tot een tijd, een stekker aan, of terug.
   */
  if (path === '/api/hand') {
    const h = d.options.hand;
    const config = d.config();
    if (h == null || config == null) {
      sendJson(res, 503, { wachten: 'klimaat met de hand kan alleen in de add-on' });
      return true;
    }
    if (method === 'GET') {
      const nu = Date.now();
      const zoneVan = (id: string) => config.zones.find((z) => z.actuatorIds.some((a) => config.actuators.find((x) => x.id === a)?.ref.id === id));
      const knoppen = h.knoppen();
      const apparaten = (await h.hand.standen(knoppen.map((k) => k.id))).map((s) => {
        const knop = knoppen.find((k) => k.id === s.id);
        if (knop) return { ...s, naam: knop.naam, kamer: knop.kamer, zoneId: null };
        const a = config.actuators.find((x) => x.ref.id === s.id);
        const zone = zoneVan(s.id);
        return { ...s, naam: a?.name ?? s.id, kamer: zone?.name ?? null, zoneId: zone?.id ?? null };
      });
      const schakelaars = h.schakelaars().map((s) => ({ ...s, totMs: h.hand.schakelaarTot(s.id) }));
      // Het eind van het dagdeel: 22:00, of 's nachts twee uur, zoals de klimaatbrug.
      sendJson(res, 200, { aan: h.aan(), apparaten, schakelaars, dagdeelTotMs: totWanneer(null, nu, config.timezone, false), nu });
      return true;
    }
    if (method !== 'POST') {
      sendJson(res, 405, { fout: 'met de hand: GET of POST' });
      return true;
    }
    if (!h.aan()) {
      sendJson(res, 409, { fout: 'klimaat met de hand staat uit bij Functies › Praten' });
      return true;
    }
    let body: Record<string, unknown>;
    try {
      const b = await readJson(req);
      if (typeof b !== 'object' || b == null || Array.isArray(b)) throw new Error('verwacht een object');
      body = b as Record<string, unknown>;
    } catch (error) {
      sendJson(res, 400, { fout: (error as Error).message });
      return true;
    }
    const id = typeof body['id'] === 'string' ? body['id'] : '';
    const totMs = Number(body['totMs']);
    try {
      if (body['terug'] === true) {
        sendJson(res, (await h.hand.terugNu(id)) ? 200 : 404, { ok: true });
        return true;
      }
      if (id.startsWith('switch.')) {
        if (!h.schakelaars().some((s) => s.id === id)) {
          sendJson(res, 400, { fout: 'die stekker is geen warmtebron buiten je regeling' });
          return true;
        }
        const uit = await h.hand.schakelAan(id, totMs);
        sendJson(res, uit.ok ? 200 : 400, uit.ok ? uit : { fout: uit.reden });
        return true;
      }
      const modus = body['modus'];
      const doel = Number(body['doelC']);
      // Een radiatorknop buiten de regeling: zijn eigen doel, direct.
      if (h.knoppen().some((k) => k.id === id)) {
        if (!Number.isFinite(doel)) {
          sendJson(res, 400, { fout: 'doelC is een getal' });
          return true;
        }
        const uit = await h.hand.zetKnop(id, doel, totMs);
        sendJson(res, uit.ok ? 200 : 400, uit.ok ? uit : { fout: uit.reden });
        return true;
      }
      if ((modus !== 'verwarmen' && modus !== 'koelen') || !Number.isFinite(doel)) {
        sendJson(res, 400, { fout: 'modus is verwarmen of koelen, doelC een getal' });
        return true;
      }
      const uit = await h.hand.zet(id, modus, doel, totMs);
      sendJson(res, uit.ok ? 200 : 400, uit.ok ? uit : { fout: uit.reden });
    } catch (error) {
      sendJson(res, 502, { fout: `Home Assistant weigerde: ${(error as Error).message}` });
    }
    return true;
  }

  // De klimaatbrug (besluit 210): verwarmen of koelen via de knoppen van het oude systeem.
  if (path === '/api/klimaat') {
    const k = d.options.klimaat;
    const config = d.config();
    if (k == null || config == null || !k.aan() || !k.brug.beschikbaar) {
      sendJson(res, 503, { wachten: 'klimaat via je eigen regeling staat niet aan' });
      return true;
    }
    if (method !== 'POST') {
      sendJson(res, 405, { fout: 'klimaat bedien je met een POST' });
      return true;
    }
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { fout: (error as Error).message });
      return true;
    }
    // "Doe maar terug" (besluit 213): wat de brug zette, meteen terug.
    if (typeof body === 'object' && body != null && (body as Record<string, unknown>)['terug'] === true) {
      try {
        sendJson(res, 200, { ok: true, terug: await k.brug.terugNu() });
      } catch (error) {
        sendJson(res, 502, { fout: `Home Assistant weigerde: ${(error as Error).message}` });
      }
      return true;
    }
    const uit = brugVerzoek(body, config, Date.now());
    if (!uit.ok) {
      sendJson(res, 400, { fout: uit.reden });
      return true;
    }
    const p = k.brug.plan(uit.wens, uit.temperatuurC, null, config.timezone);
    if (!p.ok) {
      sendJson(res, 409, { fout: p.reden });
      return true;
    }
    try {
      await k.brug.voerUit({ ...p.plan, totMs: uit.totMs });
    } catch (error) {
      sendJson(res, 502, { fout: `Home Assistant weigerde: ${(error as Error).message}` });
      return true;
    }
    sendJson(res, 200, { ok: true, doel: p.plan.doel });
    return true;
  }

  if (path === '/api/licht') {
    const lights = d.options.lights;
    if (lights == null || !d.lichtMag()) {
      sendJson(res, 503, { wachten: 'licht bedienen staat niet aan' });
      return true;
    }
    if (method !== 'POST') {
      sendJson(res, 405, { fout: 'licht bedien je met een POST' });
      return true;
    }
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { fout: (error as Error).message });
      return true;
    }
    const result = await lights.switch(body);
    if (result.ok) sendJson(res, 200, { lampen: result.lampen });
    else sendJson(res, result.status, { fout: result.reden });
    return true;
  }

  return false;
}
