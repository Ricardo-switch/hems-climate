/**
 * Welke veranderingen in Home Assistant het huis raken (uit main.ts, besluit
 * 180): die houdt de dienst bij voor de tekening, de kamers en Apparaten, en
 * die geeft hij live door (besluit 174), meteen of rustig.
 */

import type { HaEntityState } from '../adapters/homeassistant/client.js';

// Lampen en screens, klimaat, en sensoren die temperatuur of luchtvochtigheid meten.
export const inHouse = (st: HaEntityState) =>
  st.entity_id.startsWith('light.') ||
  st.entity_id.startsWith('cover.') ||
  st.entity_id.startsWith('climate.') ||
  // De scènes van Hue, voor de ruimtes (besluit 100).
  st.entity_id.startsWith('scene.') ||
  // De camera's (besluit 106): anders zei het huis "niet bereikbaar" terwijl er beeld was.
  st.entity_id.startsWith('camera.') ||
  // Beweging, voor de kamer en het huis (15 oktober 2026).
  (st.entity_id.startsWith('binary_sensor.') && ['motion', 'occupancy', 'presence'].includes(String(st.attributes['device_class']))) ||
  // Rookmelders (21 oktober 2026): rook, koolmonoxide, hitte en een batterij die op is.
  (st.entity_id.startsWith('binary_sensor.') && ['smoke', 'carbon_monoxide', 'heat', 'battery'].includes(String(st.attributes['device_class']))) ||
  // En wanneer een melder getest is en vervangen moet.
  (st.entity_id.startsWith('sensor.') && ['date', 'timestamp'].includes(String(st.attributes['device_class'])) && /replace|test/.test(st.entity_id)) ||
  (st.entity_id.startsWith('sensor.') &&
    (st.attributes['device_class'] === 'temperature' ||
      st.attributes['device_class'] === 'humidity' ||
      // Batterijen (besluit 122): bij het apparaat, en een melding onder de 10%.
      st.attributes['device_class'] === 'battery' ||
      // Wat een apparaat nu vraagt, voor Apparaten (15 oktober 2026).
      st.attributes['device_class'] === 'power' ||
      st.attributes['device_class'] === 'energy' ||
      // De klep van een radiatorknop (besluit 126), en het filter van een airco (129).
      /valve|klep|filter/i.test(st.entity_id)));
/** Wat je bedient of ziet bewegen; een temperatuur, verbruik of batterij verschuift rustig. */
export const snelInHuis = (st: HaEntityState) =>
  /^(light|cover|scene|climate|camera)\./.test(st.entity_id) ||
  (st.entity_id.startsWith('binary_sensor.') && ['motion', 'occupancy', 'presence', 'smoke', 'carbon_monoxide', 'heat'].includes(String(st.attributes['device_class'])));
