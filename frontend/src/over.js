/*
 * Over deze app (1 november 2026): het logo groot en voluit, wat de naam
 * betekent, de versie met wat er nieuw is, en waar de broncode staat.
 */
'use strict';

const { esc, haal } = app;
const BRON = 'https://github.com/Ricardo-switch/SunARC-HA-APP';

function teken(versie) {
  const laatste = versie?.nieuw?.[0] ?? null;
  const regels = laatste ? ['nieuw', 'beter', 'opgelost'].flatMap((s) => laatste[s] ?? []).slice(0, 3) : [];
  const html = `<div class="voluit"><img src="kit/merk.svg" alt=""><div class="woord">SunArc</div><div class="arc">${t('over.arc')}</div></div>
    <div class="glas overvak">
      <div><h2>${esc(t('over.versieKop'))}</h2><div class="versie">${esc(versie?.nummer ?? '…')}</div>${regels.length ? `<ul>${regels.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}</div>
      <div><h2>${esc(t('over.naamKop'))}</h2><p>${esc(t('over.naam'))}</p></div>
      <div><h2>${esc(t('over.openKop'))}</h2><p>${esc(t('over.open'))} <a href="${BRON}" target="_blank" rel="noopener">${esc(t('over.bron'))}</a></p></div>
    </div>`;
  document.querySelectorAll('[data-over]').forEach((el) => (el.innerHTML = html));
}

async function laad() {
  teken(null);
  teken(await haal('api/versie').catch(() => null));
}

app.start('instellingen');
void laad();
