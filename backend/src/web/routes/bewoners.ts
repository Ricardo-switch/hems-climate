/**
 * Bewoners: comfort, voorkeuren, de sleutel, meldingen, uitstel en gevoel.
 *
 * Geknipt uit server.ts (besluit 180, 23 oktober 2026): letterlijk, met de
 * context `d` in plaats van de webserver zelf.
 */

import { readJson, sendJson } from '../http.js';
import { taalVan, type Diensten, type Verzoek } from '../diensten.js';

/** De routes van dit onderwerp; waar als het verzoek hier is afgehandeld. */
export async function bewonersRoutes(d: Diensten, v: Verzoek): Promise<boolean> {
  const { req, res, url, path, method } = v;
  if (path === '/api/comfort') {
    const comfort = d.options.comfort;
    if (comfort == null) {
      sendJson(res, 503, { wachten: 'comfort instellen kan pas met een configuratie en een logmap' });
      return true;
    }
    const wie = await d.wie(req);
    const van = url.searchParams.get('bewoner');
    if (method !== 'POST') {
      sendJson(res, 200, comfort.view(wie, van));
      return true;
    }
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { fout: (error as Error).message });
      return true;
    }
    const result = await comfort.save(body, wie, van);
    if (result.ok) sendJson(res, 200, result.view);
    else sendJson(res, result.status, { fout: result.reden });
    return true;
  }

  if (path === '/api/bewoners') {
    const bewoners = d.options.bewoners;
    if (bewoners == null) {
      sendJson(res, 503, { wachten: 'bewoners kan pas met een configuratie en een logmap' });
      return true;
    }
    const wie = await d.wie(req);
    if (method !== 'POST') {
      sendJson(res, 200, bewoners.view(wie));
      return true;
    }
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { fout: (error as Error).message });
      return true;
    }
    const result = await bewoners.actie(body, wie);
    if (result.ok) sendJson(res, 200, result.view);
    else sendJson(res, result.status, { fout: result.reden });
    return true;
  }

  /*
   * Thuis naar eigen smaak (besluit 162): je eigen kaarten en favorieten op de
   * telefoon, je thema en je kleur, en de wand in het profiel van wiens
   * comfort geldt (besluit 181).
   */
  if (path === '/api/voorkeuren') {
    const voorkeuren = d.options.voorkeuren;
    if (voorkeuren == null) {
      sendJson(res, 503, { wachten: 'kiezen kan pas met een logmap' });
      return true;
    }
    const wie = await d.wie(req);
    const profiel = d.options.profielen?.(wie.userId);
    const kijker = { userId: wie.userId, magWand: wie.beheerder || (await d.hoofd(req)), ...(profiel ? { profielen: profiel.profielen, scherm: profiel.scherm } : {}) };
    // De telefoons voor de meldingen (besluit 183) staan erbij: die komen uit Home Assistant, niet uit het bestand.
    const telefoons = d.options.telefoons?.(wie.userId) ?? [];
    // Elke pagina vraagt dit op, met de taal waarin de app opende: die geldt bij Automatisch voor de telefoon (besluit 185).
    if (req.headers['x-taal'] != null) voorkeuren.zagTaal(wie.userId, taalVan(req.headers['x-taal']));
    if (method !== 'POST') {
      sendJson(res, 200, { ...voorkeuren.view(kijker), telefoons });
      return true;
    }
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { fout: (error as Error).message });
      return true;
    }
    const result = await voorkeuren.save(body, kijker);
    if (result.ok) sendJson(res, 200, { ...result.view, telefoons });
    else sendJson(res, result.status, { fout: result.reden });
    return true;
  }

  // De sleutel voor de assistent van Home Assistant (besluit 147): alleen voor een beheerder.
  if (path === '/api/sleutel') {
    const wie = await d.wie(req);
    if (!wie.beheerder) sendJson(res, 403, { fout: 'dit mag alleen de beheerder' });
    else if (d.options.sleutel == null) sendJson(res, 404, { fout: 'er is geen sleutel' });
    else {
      const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0]!.trim();
      sendJson(res, 200, { sleutel: d.options.sleutel, adres: d.options.sleutelAdres ?? `${proto}://${req.headers.host}/api/vraag` });
    }
    return true;
  }

  if (path === '/api/meldingen') {
    const store = d.options.meldingen;
    if (store == null) {
      sendJson(res, 200, { actief: [], eerder: [] });
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
      const vraag = typeof body === 'object' && body != null ? (body as Record<string, unknown>) : {};
      // "verwijder" haalt elke melding weg; "negeer" blijft voor wat er al was.
      const gelukt = vraag['verwijder'] != null ? store.verwijder(vraag['verwijder']) : store.negeer(vraag['negeer']);
      if (!gelukt) {
        sendJson(res, 400, { fout: 'die melding is er niet' });
        return true;
      }
      await store.bewaar().catch(() => undefined);
      // Weggehaald op de telefoon: ook weg op de wand.
      d.live.meldingenVeranderd();
    }
    sendJson(res, 200, store.lijst(Date.now(), taalVan(url.searchParams.get('taal') ?? req.headers['x-taal'])));
    return true;
  }

  if (path === '/api/uitstel') {
    const uitstel = d.options.uitstel;
    if (uitstel == null) {
      sendJson(res, 503, { wachten: '"klaar voor" staat niet aan' });
      return true;
    }
    if (method !== 'POST') {
      sendJson(res, 405, { fout: '"klaar voor" zet je met een POST' });
      return true;
    }
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { fout: (error as Error).message });
      return true;
    }
    const result = await uitstel.set(body);
    if (result.ok) sendJson(res, 200, { id: result.id, klaarVoorMs: result.klaarVoorMs });
    else sendJson(res, result.status, { fout: result.reden });
    return true;
  }

  if (path === '/api/gevoel') {
    const feedback = d.options.feedback;
    if (feedback == null) {
      sendJson(res, 503, { wachten: 'gevoel en toelichting staan niet aan' });
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
      // De temperatuur en het dagdeel van nu erbij (besluit 134): daaruit leert het huis wat jij prettig vindt.
      const snap = d.options.latest();
      const zoneId = typeof body === 'object' && body != null ? (body as Record<string, unknown>)['zoneId'] : null;
      const pz = snap?.explanation.perZone.find((z) => z.zoneId === zoneId);
      const result = await feedback.add(body, { temperatuurC: pz?.temperatureC ?? null, dagdeel: snap?.explanation.mode ?? null });
      if (result.ok) sendJson(res, 200, result.record);
      else sendJson(res, result.status, { fout: result.reden });
      return true;
    }
    // Wat er is vastgelegd: standaard de afgelopen 24 uur, of tot acht weken terug (besluit 134).
    const dagen = Math.max(1, Math.min(56, Number(url.searchParams.get('dagen')) || 1));
    sendJson(res, 200, await feedback.since(Date.now() - dagen * 86_400_000));
    return true;
  }

  return false;
}
