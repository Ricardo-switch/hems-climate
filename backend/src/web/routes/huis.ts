/**
 * Het huis: de indeling, het huis zelf, en licht, scènes en schermen bedienen.
 *
 * Geknipt uit server.ts (besluit 180, 23 oktober 2026): letterlijk, met de
 * context `d` in plaats van de webserver zelf.
 */

import { OUTSIDE_FLOOR, floorName, floorOrder, standardFloors } from '../layout.js';
import { readJson, sendJson } from '../http.js';
import { taalVan, type Diensten, type Verzoek } from '../diensten.js';

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
