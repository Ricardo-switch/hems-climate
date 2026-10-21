/*
 * De assistent als gesprek (besluit 141, schets Wand-Assistent-Gesprek). Het
 * huis praat zelf: het begroet je naar de tijd van de dag, vraagt hoe het kan
 * helpen, leest zijn antwoord voor en vraagt daarna of het nog iets kan doen.
 *
 * De antwoorden komen kant-en-klaar uit de dienst (`api/vraag`, besluit 94):
 * elk getal komt uit wat het huis meet en besluit. Heeft de bewoner bij
 * Functies een taalmodel gekozen, dan zegt de dienst het in eigen woorden
 * (besluit 148); de getallen blijven dezelfde. Een opdracht ("licht beneden
 * zachter", "screen dicht") komt terug als opdracht: deze pagina stuurt die
 * naar dezelfde deur als de knoppen, en het huis zegt wat het deed. Terwijl een
 * scherm beweegt, stopt "Stop het screen" het scherm en "Stil" het praten.
 * De stem is Piper in Home Assistant (`api/stem`); is
 * die er niet, dan een Nederlandse stem van het apparaat zelf, en anders
 * alleen tekst. Geluid kan pas na een tik: dat bepaalt de browser; een tik
 * op Thuis telt mee.
 *
 * Het adres kan een vraag meegeven: `#nu`, `#zon`, `#straks`, `#vandaag`,
 * `#warm`, `#morgen`, `#kosten`, `#waarom/zolder`; met `#typ` staat de cursor
 * in het veld. Zo'n vraag komt van een tik op Thuis: dan probeert het huis
 * meteen te spreken.
 */
'use strict';

const { $$, nl, esc, haal } = app;

let state = null;
let huisData = null;
let zon = null;
let weer = null;
let vandaag = null;
let stemNaam = null;
/** Of een vraag uit het adres kwam (een tik op Thuis): dan meteen proberen te spreken. */
let vanAdres = false;
/** Wie hier woont (besluit 147): voor de begroeting met je naam. */
let bewoners = null;
/** Het scherm dat de assistent net liet bewegen (besluit 148), met wanneer; "stop" geldt daarvoor. */
let beweegt = null;
const BEWEEGT_MS = 60_000;
const beweegtNog = () => (beweegt && Date.now() - beweegt.sinds < BEWEEGT_MS ? beweegt : null);

async function laadAlles() {
  const [s, h, z, w, v, st, b] = await Promise.allSettled([haal('api/state'), haal('api/huis'), haal('api/zon'), haal('api/weer'), haal('api/vandaag'), haal('api/stem'), haal('api/bewoners')]);
  if (b.status === 'fulfilled') bewoners = b.value;
  if (s.status === 'fulfilled') state = s.value;
  if (h.status === 'fulfilled') huisData = h.value;
  if (z.status === 'fulfilled') zon = z.value;
  if (w.status === 'fulfilled' && w.value?.vandaag) weer = w.value;
  if (v.status === 'fulfilled') vandaag = v.value;
  // Piper alleen als die Nederlands kan; anders klinkt het Engels (opgelost 15 oktober).
  if (st.status === 'fulfilled') stemNaam = st.value?.stem && st.value?.taal ? st.value.stem : null;
  teken();
}

/* ------------------------------------------------------------ het gesprek */

/** begin, denkt, praat, verder. */
let stand = 'begin';
/** De laatste vraag met zijn antwoord. */
let nu = null;
/** Wat eerder gevraagd werd, nieuwste eerst; hooguit vier. */
const eerder = [];
/** Of de browser geluid toestaat: pas na een tik. */
let ontgrendeld = false;
const VOORLEZEN = 'sc-voorlezen';
let voorlezen = (() => {
  try {
    return localStorage.getItem(VOORLEZEN) !== 'uit';
  } catch {
    return true;
  }
})();

/** De begroeting naar de tijd van de dag, met je naam, of op een scherm met wie er thuis is (besluit 147). */
function groet() {
  const u = new Date().getHours();
  const tijd = u < 6 ? 'Goedenacht' : u < 12 ? 'Goedemorgen' : u < 18 ? 'Goedemiddag' : 'Goedenavond';
  const namen = huismodel.groetNamen(bewoners);
  return namen.length ? `${tijd}, ${namen.length > 1 ? `${namen.slice(0, -1).join(', ')} en ${namen.at(-1)}` : namen[0]}` : tijd;
}

const zoneNaam = (id) => huismodel.zoneNaam(id, huisData);

/* ------------------------------------------------------------ de vragen */

const IK = {
  zon: ['zon', '<svg viewBox="0 0 24 24" fill="none" stroke="#F7B548" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/></svg>'],
  grafiek: ['zon', '<svg viewBox="0 0 24 24" fill="none" stroke="#F7B548" stroke-width="1.9" stroke-linecap="round"><path d="M4 18h16M7 14l3-4 3 3 4-6"/></svg>'],
  klok: ['violet', '<svg viewBox="0 0 24 24" fill="none" stroke="#B7B0FF" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>'],
  temp: ['', '<svg viewBox="0 0 24 24" fill="none" stroke="#a9e6ff" stroke-width="1.9" stroke-linecap="round"><path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z"/></svg>'],
  koel: ['', '<svg viewBox="0 0 24 24" fill="none" stroke="#a9e6ff" stroke-width="1.9" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/></svg>'],
  warm: ['warm', '<svg viewBox="0 0 24 24" fill="none" stroke="#ffb090" stroke-width="1.9" stroke-linecap="round"><path d="M12 21c-3.3 0-6-2.5-6-6 0-4 4-6 4-10 2.5 1.5 4 4 4 6 1-.8 1.5-2 1.5-3 1.6 1.4 2.5 3.8 2.5 7 0 3.5-2.7 6-6 6z"/></svg>'],
  nu: ['violet', '<svg viewBox="0 0 24 24" fill="none" stroke="#B7B0FF" stroke-width="1.9" stroke-linecap="round"><path d="M4 12h3l2-6 4 12 2-6h5"/></svg>'],
  weer: ['', '<svg viewBox="0 0 24 24" fill="none" stroke="#a9e6ff" stroke-width="1.9" stroke-linecap="round"><path d="M7 17h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 17z"/></svg>'],
  licht: ['lamp', '<svg viewBox="0 0 24 24" fill="none" stroke="#FFB765" stroke-width="1.9" stroke-linecap="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/></svg>'],
  scene: ['violet', '<svg viewBox="0 0 24 24" fill="none" stroke="#B7B0FF" stroke-width="1.9" stroke-linecap="round"><circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><circle cx="12" cy="16" r="3"/></svg>'],
  scherm: ['', '<svg viewBox="0 0 24 24" fill="none" stroke="#6FD3FF" stroke-width="1.9" stroke-linecap="round"><rect x="4" y="4" width="16" height="4" rx="1"/><path d="M6 8v9h12V8M6 13h12"/></svg>'],
};

/** Wachten op zon: per kamer wat er nodig is en wat er over is. */
function wachtenden() {
  const over = Math.max(0, (state?.explanation?.budget?.surplusW ?? 0) / 1000);
  const gezien = new Set();
  return (state?.rejected ?? [])
    .filter((r) => r.blockedBy === 'insufficient_power_budget' && r.intent?.budgetW > 0)
    .filter((r) => (gezien.has(r.intent.zoneId) ? false : gezien.add(r.intent.zoneId)))
    .map((r) => ({ zoneId: r.intent.zoneId, nodig: r.intent.budgetW / 1000, over }));
}

/**
 * De vragen die nu ergens over gaan, met het cijfer erbij: een kamer die
 * wacht of draait, de zon, de dag, de temperatuur. Alleen wat de dienst kan
 * beantwoorden.
 */
function suggesties() {
  const uit = [];
  for (const w of wachtenden()) {
    uit.push({ label: `Waarom wacht ${zoneNaam(w.zoneId)}?`, hint: `${nl(w.over)} van de ${nl(w.nodig)} kW zon`, ik: 'zon', v: { soort: 'waarom', kamer: w.zoneId } });
  }
  for (const k of state?.bewoner?.kamers ?? []) {
    if (k.soort !== 'cool' && k.soort !== 'heat') continue;
    uit.push({ label: `Waarom ${k.soort === 'cool' ? 'koelt' : 'verwarmt'} ${zoneNaam(k.zoneId)}?`, hint: k.kort ?? '', ik: k.soort === 'cool' ? 'koel' : 'warm', v: { soort: 'waarom', kamer: k.zoneId } });
  }
  const z = weer?.vandaag;
  const zonOp = zon?.zon?.boven;
  // Naast de verwachting van vanochtend, net als op Thuis en Vandaag (opgelost 15 oktober).
  const vooraf = z?.verwachtVoorafKwh ?? null;
  if (z) uit.push({ label: zonOp ? 'Hoeveel zon komt er nog?' : 'Hoeveel zon was er vandaag?', hint: vooraf != null ? `${nl(z.opgewektKwh)} kWh, verwacht ${nl(vooraf)}` : `${nl(z.opgewektKwh)} kWh`, ik: 'grafiek', v: { soort: 'zon' } });
  else uit.push({ label: 'Hoeveel zon vandaag?', hint: '', ik: 'grafiek', v: { soort: 'zon' } });
  uit.push({ label: 'Wat deed je vandaag?', hint: 'de dag tot nu toe', ik: 'klok', v: { soort: 'vandaag' } });
  // 's Avonds is morgen interessanter dan straks (besluit 142).
  const m = weer?.dagen?.[0];
  if (m && !zonOp) uit.push({ label: 'Wat wordt het weer morgen?', hint: [m.tekst, m.maxC != null ? `${nl(m.maxC, 0)}°` : null].filter(Boolean).join(', '), ik: 'weer', v: { soort: 'morgen' } });
  const temps = (huisData?.etages ?? []).flatMap((e) => e.ruimtes ?? []).filter((r) => r.zoneId && r.temperatuurC != null).map((r) => r.temperatuurC);
  uit.push({ label: 'Hoe warm is het overal?', hint: temps.length ? `${nl(Math.min(...temps))} tot ${nl(Math.max(...temps))}°` : '', ik: 'temp', v: { soort: 'warm' } });
  uit.push({ label: 'Wat doe je nu?', hint: state?.bewoner?.kop?.titel ?? '', ik: 'nu', v: { soort: 'nu' } });
  uit.push({ label: 'Wat ga je straks doen?', hint: 'het schema en de zon', ik: 'klok', v: { soort: 'straks' } });
  return uit.slice(0, 4);
}

/** Na een antwoord: wat er logisch op volgt. */
function vervolg(item) {
  // Na bedienen: wat er nu kan, uit de dienst (besluit 148).
  if (item?.vervolg?.length) {
    const ik = item.gedaan?.[0]?.soort === 'scherm' ? 'scherm' : 'licht';
    return item.vervolg.slice(0, 3).map((x) => ({ label: x.label, hint: '', ik: /^Scène/.test(x.label) ? 'scene' : ik, v: { soort: 'vrij', tekst: x.tekst } }));
  }
  const alle = suggesties();
  const al = (v) => item && v.soort === item.soort && (v.kamer ?? null) === (item.kamer ?? null);
  const voorkeur = {
    waarom: ['straks', 'zon', 'warm'],
    zon: ['vandaag', 'straks', 'nu'],
    nu: ['straks', 'vandaag', 'warm'],
    straks: ['zon', 'nu', 'vandaag'],
    vandaag: ['zon', 'warm', 'nu'],
    warm: ['waarom', 'nu', 'vandaag'],
    morgen: ['zon', 'straks', 'warm'],
    kosten: ['vandaag', 'zon', 'nu'],
  }[item?.soort] ?? ['nu', 'zon', 'warm'];
  const vast = {
    straks: { label: 'Wat ga je straks doen?', hint: 'het schema en de zon', ik: 'klok', v: { soort: 'straks' } },
    nu: { label: 'Wat doe je nu?', hint: '', ik: 'nu', v: { soort: 'nu' } },
  };
  const lijst = [];
  for (const s of voorkeur) {
    const kandidaat = alle.find((x) => x.v.soort === s && !al(x.v)) ?? vast[s];
    if (kandidaat && !al(kandidaat.v) && !lijst.some((x) => x.label === kandidaat.label)) lijst.push(kandidaat);
  }
  return lijst.slice(0, 3);
}

async function vraag(v) {
  stopPraten();
  if (nu) {
    eerder.unshift(nu);
    eerder.splice(4);
  }
  nu = { ...v, antwoord: null, kamerId: v.kamer ?? null, feiten: [] };
  stand = 'denkt';
  teken();
  try {
    const scherm = beweegtNog()?.id;
    const q = new URLSearchParams(v.soort === 'vrij' ? { v: 'vrij', tekst: v.tekst, ...(scherm ? { scherm } : {}) } : { v: v.soort, ...(v.kamer ? { kamer: v.kamer } : {}) });
    const res = await fetch(`api/vraag?${q}`);
    const body = await res.json();
    nu.antwoord = res.ok ? body.antwoord : body.fout ?? body.wachten ?? 'Daar heb ik geen antwoord op.';
    nu.kamerId = body.kamer ?? nu.kamerId;
    nu.feiten = body.feiten ?? [];
    if (v.soort === 'vrij' && res.ok) nu.soort = body.vraag;
    nu.link = body.link ?? null;
    nu.voorbeelden = body.voorbeelden ?? [];
    // Zoals het klinkt (besluit 142): eenheden voluit, tijden in woorden.
    nu.gesproken = body.gesproken ?? null;
    nu.ruimte = body.ruimte ?? null;
    nu.vervolg = body.vervolg ?? [];
    // Een opdracht (besluit 148): meteen naar dezelfde deur als de knoppen.
    if (res.ok && body.opdracht) await voerUit(body);
    // Alleen geluid: niets gezegd, niets te antwoorden (21 oktober 2026).
    if (res.ok && body.vraag === 'ruis') {
      nu = eerder.shift() ?? null;
      stand = nu ? 'verder' : 'begin';
      teken();
      return;
    }
    // "Oké bedankt": het gesprek is klaar, zoals Nee, dank je.
    if (res.ok && body.vraag === 'klaar') {
      nu = null;
      stand = 'begin';
      teken();
      void zeg(body.antwoord, body.gesproken ?? body.antwoord).then(() => {
        stand = 'begin';
        teken();
      });
      return;
    }
  } catch {
    nu.antwoord = 'Ik kan Smart Climate nu niet bereiken.';
  }
  void zeg(nu.antwoord, nu.gesproken ?? nu.antwoord);
}

/** Stuurt een opdracht naar zijn deur; lukt het niet, dan zegt het huis waarom. */
async function voerUit(body) {
  try {
    const res = await fetch(body.opdracht.pad, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body.opdracht.body) });
    if (!res.ok) {
      const fout = await res.json().catch(() => ({}));
      nu.antwoord = `Dat lukte niet: ${String(fout.fout ?? fout.wachten ?? 'Home Assistant gaf geen antwoord').replace(/\.$/, '')}.`;
      nu.gesproken = null;
      nu.feiten = [];
      nu.vervolg = [];
      return;
    }
  } catch {
    nu.antwoord = 'Ik kan Smart Climate nu niet bereiken.';
    nu.gesproken = null;
    return;
  }
  nu.gedaan = body.gedaan ?? [];
  // Een scherm dat beweegt: "stop" geldt daarvoor, en er komt een knop bij.
  beweegt = body.beweegt ? { ...body.beweegt, sinds: Date.now() } : body.opdracht.body?.actie === 'stop' ? null : beweegt;
  // Het huis laat zien wat er veranderde, zodra Home Assistant het weet.
  setTimeout(() => void laadAlles(), 1500);
}

/* ------------------------------------------------------------ praten */

let audio = null;
let ctx = null;
let analyser = null;
let bron = null;
let rafId = 0;
let woorden = [];
let gezegd = 0;
let klaar = null;
/** Wat er nu hardop gezegd wordt: een antwoord, de begroeting of het afscheid. */
let zegtNu = null;

/** De woorden van een zin, met waar elk begint in de tekst. */
function splitsWoorden(tekst) {
  const uit = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(tekst))) uit.push({ w: m[0], van: m.index });
  return uit;
}

function zetGezegd(i) {
  gezegd = i;
  $$('[data-zegt] .w').forEach((el, k) => {
    el.classList.toggle('al', k < i);
    el.classList.toggle('nu', k === i - 1);
  });
}

function stopPraten() {
  cancelAnimationFrame(rafId);
  for (const el of [audio, kaal]) {
    if (!el) continue;
    el.pause();
    el.src = '';
  }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (klaar) {
    const k = klaar;
    klaar = null;
    k();
  }
}

/** De stralen rond de bol: van de echte stem, of een rustige golf zonder. */
const STRALEN = 72;
function tekenGolf(niveaus) {
  for (const svg of $$('[data-golf]')) {
    if (!svg.childElementCount) {
      const lijnen = Array.from({ length: STRALEN }, () => '<line stroke="url(#gl)" stroke-width="2.6" stroke-linecap="round"/>').join('');
      svg.innerHTML = `<defs><linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fc4ff"/><stop offset="1" stop-color="#b7b0ff"/></linearGradient></defs>${lijnen}`;
    }
    const r0 = 92;
    svg.querySelectorAll('line').forEach((l, i) => {
      const a = (i / STRALEN) * Math.PI * 2 - Math.PI / 2;
      const len = 6 + (niveaus[i] ?? 0) * 46;
      l.setAttribute('x1', (150 + Math.cos(a) * r0).toFixed(1));
      l.setAttribute('y1', (150 + Math.sin(a) * r0).toFixed(1));
      l.setAttribute('x2', (150 + Math.cos(a) * (r0 + len)).toFixed(1));
      l.setAttribute('y2', (150 + Math.sin(a) * (r0 + len)).toFixed(1));
    });
  }
}

function leefMee(bijWoord) {
  const stil = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
  const t0 = performance.now();
  const stap = () => {
    let niveaus;
    if (data) {
      analyser.getByteFrequencyData(data);
      // Rond de bol gespiegeld: de lage tonen boven, de hoge opzij.
      niveaus = Array.from({ length: STRALEN }, (_, i) => {
        const k = Math.min(STRALEN - i, i);
        return (data[Math.floor((k / (STRALEN / 2)) * data.length * 0.55)] ?? 0) / 255;
      });
    } else {
      const t = (performance.now() - t0) / 1000;
      niveaus = Array.from({ length: STRALEN }, (_, i) => 0.25 + 0.25 * Math.abs(Math.sin(t * 5 + i * 0.5) * Math.sin(t * 2.3 + i * 0.17)));
    }
    if (!stil) tekenGolf(niveaus);
    bijWoord?.();
    rafId = requestAnimationFrame(stap);
  };
  rafId = requestAnimationFrame(stap);
}

/** Een Nederlandse stem van het apparaat zelf, nooit een die online praat. */
function apparaatStem() {
  if (!('speechSynthesis' in window)) return null;
  return speechSynthesis.getVoices().find((v) => v.localService && /^nl/i.test(v.lang)) ?? null;
}

/** Of de browser het geluid weigerde: dan zegt de bol "Tik om te horen". */
let tikOmTeHoren = false;
let kaal = null;

/**
 * Zegt een tekst: hardop als het mag en kan, en altijd met de woorden die
 * meekomen. Daarna vraagt het huis of het nog iets kan doen. `gesproken` is
 * de tekst zoals hij klinkt (besluit 142), voor de stem van het apparaat.
 */
function zeg(tekst, gesproken = tekst) {
  return new Promise((ok) => {
    woorden = splitsWoorden(tekst);
    zegtNu = tekst;
    stand = 'praat';
    tikOmTeHoren = false;
    teken();
    zetGezegd(0);
    klaar = () => {
      cancelAnimationFrame(rafId);
      zetGezegd(woorden.length);
      stand = 'verder';
      teken();
      ok();
    };
    const totLetter = (i) => woorden.findIndex((w) => w.van > i);
    const lezen = () => {
      // Zonder stem: in het tempo van rustig voorlezen.
      const t0 = performance.now();
      const duur = Math.max(1600, tekst.length * 55);
      leefMee(() => {
        const p = (performance.now() - t0) / duur;
        const i = totLetter(p * tekst.length);
        zetGezegd(i < 0 ? woorden.length : i);
        if (p >= 1 && klaar) klaar();
      });
    };
    // De browser wilde geen geluid: lezen, en de bol zegt dat een tik het laat horen.
    const geweigerd = () => {
      tikOmTeHoren = true;
      vanAdres = false;
      lezen();
    };
    const apparaat = () => zegMetApparaat(tekst, gesproken, totLetter, lezen, geweigerd);
    // Een vraag via een tik op Thuis mag meteen proberen (opgelost 15 oktober).
    if (!voorlezen || !(ontgrendeld || vanAdres)) return lezen();
    if (stemNaam) return void zegMetPiper(tekst, totLetter, apparaat, geweigerd);
    apparaat();
  });
}

/**
 * Piper uit Home Assistant. De stralen leven mee met het echte geluid, maar
 * alleen als de browser Web Audio al toestaat; anders speelt het geluid
 * gewoon, met een rustige golf. Een stilgezette Web Audio zou het geluid
 * inslikken.
 */
async function zegMetPiper(tekst, totLetter, apparaat, geweigerd) {
  let golf = false;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state !== 'running') await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 250))]);
    golf = ctx.state === 'running';
  } catch {
    golf = false;
  }
  if (!klaar) return;
  let el;
  if (golf) {
    audio ??= new Audio();
    audio.crossOrigin = 'anonymous';
    if (!bron) {
      bron = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      bron.connect(analyser);
      analyser.connect(ctx.destination);
    }
    el = audio;
  } else {
    kaal ??= new Audio();
    el = kaal;
  }
  const golfVan = golf ? analyser : null;
  el.src = `api/stem?tekst=${encodeURIComponent(tekst)}`;
  el.onended = () => klaar?.();
  el.onerror = () => {
    if (!klaar) return;
    stemNaam = null;
    apparaat();
  };
  el.play().then(
    () => {
      ontgrendeld = true;
      analyser = golfVan;
      leefMee(() => {
        if (!el.duration || !isFinite(el.duration)) return;
        const i = totLetter((el.currentTime / el.duration) * tekst.length);
        zetGezegd(i < 0 ? woorden.length : i);
      });
    },
    (e) => (e?.name === 'NotAllowedError' ? geweigerd() : apparaat()),
  );
}

/** De stem van het apparaat, of alleen de woorden als die er niet is. Hoort bij zeg(). */
function zegMetApparaat(tekst, gesproken, totLetter, lezen, geweigerd) {
  const v = apparaatStem();
  if (!v) return lezen();
  const u = new SpeechSynthesisUtterance(gesproken);
  u.voice = v;
  u.lang = v.lang;
  u.rate = 1;
  // Wat klinkt is langer dan wat er staat; de plek gaat naar rato.
  u.onboundary = (e) => {
    const i = totLetter((e.charIndex / Math.max(1, gesproken.length)) * tekst.length);
    zetGezegd(i < 0 ? woorden.length : i);
  };
  u.onend = () => klaar?.();
  // Geweigerd: tik om te horen. Gestopt: klaar. Iets anders mis: dan de woorden in leestempo.
  u.onerror = (e) => (e?.error === 'not-allowed' ? geweigerd() : e?.error === 'interrupted' || e?.error === 'canceled' ? klaar?.() : lezen());
  analyser = null;
  leefMee();
  speechSynthesis.speak(u);
}

/* ------------------------------------------------------------ de microfoon */

/*
 * Tikken en praten (besluit 150): het geluid gaat via de dienst naar Home Assistant,
 * dat het uitschrijft; daarna gaat het zoals een getypte zin. Nog een tik: klaar.
 */
let luistert = null;
let niveauRaf = 0;

function tekenNiveau() {
  cancelAnimationFrame(niveauRaf);
  const stap = () => {
    const n = window.luisteren?.niveau() ?? 0;
    $$('[data-niveau]').forEach((el) => {
      if (!el.childElementCount) el.innerHTML = '<i></i>'.repeat(28);
      el.querySelectorAll('i').forEach((i, k) => (i.style.height = `${4 + n * 26 * (0.45 + 0.55 * Math.abs(Math.sin(k * 0.8 + performance.now() / 160)))}px`));
    });
    if (luistert) niveauRaf = requestAnimationFrame(stap);
  };
  niveauRaf = requestAnimationFrame(stap);
}

function stopLuisteren() {
  luistert = null;
  cancelAnimationFrame(niveauRaf);
  document.body.classList.remove('luistert');
  $$('[data-niveau]').forEach((el) => (el.hidden = true));
}

async function microfoonTik() {
  if (luistert) return void luistert.klaar?.();
  stopPraten();
  ontgrendeld = true;
  document.body.classList.add('luistert');
  $$('[data-niveau]').forEach((el) => (el.hidden = false));
  luistert = {};
  tekenNiveau();
  try {
    luistert = await window.luisteren.eenmaal((b) => {
      if (b.soort === 'tekst') {
        stopLuisteren();
        if (b.tekst) void vraag({ label: b.tekst, soort: 'vrij', tekst: b.tekst });
        else void zeg('Dat verstond ik niet. Tik nog eens op de microfoon.');
      } else if (b.soort === 'fout') {
        stopLuisteren();
        void zeg(b.reden);
      } else if (b.soort === 'dicht') stopLuisteren();
    });
  } catch (e) {
    stopLuisteren();
    void zeg(e?.message === 'tik' ? 'Tik op de microfoon om te praten.' : 'De microfoon mag niet. Geef deze pagina toegang tot de microfoon.');
  }
}

/* ------------------------------------------------------------ tekenen */

/** Waar een feit vandaan komt, in gewone woorden; wat hier niet staat, toont de pagina niet. */
const FEIT = { temperatuur: 'temperatuur', doel: 'doel', zonWh: 'opgewekt', piekW: 'het meeste', piekTijd: 'om', netAfWh: 'van het net', netTerugWh: 'terug', vermogen: 'zon nu', zelfPct: 'zelf gebruikt', rest: 'komt nog', vooraf: 'verwacht', verwacht: 'van je panelen', maxC: 'warmst', regenkans: 'kans op regen', euro: 'kosten' };
function feiten(item) {
  return (item?.feiten ?? [])
    .map((f) => {
      const d = String(f.bron).split('.');
      let naam = FEIT[d.at(-1)];
      if (d[0] === 'zone' && d.length === 3 && naam) naam = `${zoneNaam(d[1])}${d[2] === 'temperatuur' ? '' : `, ${naam}`}`;
      if (d[1] === 'morgen' && naam) naam = `morgen, ${naam}`;
      return naam ? `<div class="feit"><b>${esc(f.tekst)}</b><span>${esc(naam)}</span></div>` : '';
    })
    .filter(Boolean)
    .slice(0, 4)
    .join('');
}

/** Wat er veranderde (besluit 148): een kaartje per apparaat. */
function gedaanHtml(item) {
  return (item?.gedaan ?? [])
    .map((k) => {
      const [klasse, svg] = IK[k.soort] ?? IK.licht;
      return `<div class="ding${k.soort === 'scherm' && beweegtNog() ? ' beweegt' : ''}"><span class="ik ${klasse}">${svg}</span><b>${esc(k.waarde)}</b><span>${esc(k.uitleg)}</span></div>`;
    })
    .join('');
}

const woordHtml = (tekst) => splitsWoorden(tekst).map((w) => `<span class="w${/\d/.test(w.w) ? ' getal' : ''}">${esc(w.w)}</span>`).join(' ');

function spraakHtml() {
  const wie = (t) => (app.telStand() ? '' : `<span class="wie"><i></i>${esc(t)}</span>`);
  // De begroeting of het afscheid, terwijl het huis die zegt.
  if (stand === 'praat' && zegtNu != null && zegtNu !== nu?.antwoord) return `${wie('Je huis, aan het praten')}<p class="zegt loopt" data-zegt>${woordHtml(zegtNu)}</p>`;
  if (stand === 'begin' || !nu) {
    const kop = state?.bewoner?.kop;
    const tekst = `${groet()}. Waarmee kan ik je helpen?`;
    return `${wie('Je huis')}<p class="zegt" data-zegt>${woordHtml(tekst)}</p>${kop ? `<p class="klein-zegt">${esc([kop.titel, kop.zin].filter(Boolean).join('. ').replace(/\.\./g, '.'))}</p>` : ''}`;
  }
  const jij = `<p class="jij">Jij: <b>${esc(nu.label)}</b></p>`;
  if (stand === 'denkt') return `${wie('Je huis denkt na')}${jij}<p class="zegt" style="color: var(--gedempt)">Even kijken…</p>`;
  const lang = (nu.antwoord ?? '').length > 150;
  const verder = stand === 'verder';
  return `${wie(stand === 'praat' ? 'Je huis, aan het praten' : 'Je huis')}${jij}
    <p class="zegt${lang ? ' lang' : ''}${verder ? '' : ' loopt'}" data-zegt>${woordHtml(nu.antwoord ?? '')}</p>
    ${verder ? (nu.gedaan?.length ? `<div class="gedaan">${gedaanHtml(nu)}</div>` : `<div class="feiten">${feiten(nu)}</div>`) : ''}
    ${verder && nu.link ? `<div class="verder"><a class="knop knop-licht" href="${esc(nu.link.href)}">${esc(nu.link.label)}</a></div>` : ''}
    ${verder ? '<p class="klein-zegt nogiets">Kan ik je nog ergens mee helpen?</p>' : ''}`;
}

function sugHtml(s, i) {
  const [klasse, svg] = IK[s.ik] ?? IK.nu;
  return `<button type="button" class="sug" data-sug="${i}"><span class="ik ${klasse}">${svg}</span><span><b>${esc(s.label)}</b>${s.hint ? `<span>${esc(s.hint)}</span>` : ''}</span></button>`;
}

let getoond = [];
function tekenHuis() {
  if (!huisData) return;
  const kamer = stand === 'praat' || stand === 'verder' ? nu?.kamerId ?? null : null;
  // De ruimte van een opdracht (besluit 148): die licht op, ook zonder regelgebied.
  const ruimte = stand === 'praat' || stand === 'verder' ? nu?.ruimte ?? null : null;
  const alles = stand !== 'begin' && nu?.soort === 'warm';
  // De tekening uit huismodel, net als op Thuis (5S); de kamer waar het over gaat licht op.
  const t = huismodel.tekening(huisData, {
    zon,
    kamer: (r) => {
      const k = huismodel.kamerModel(r, state);
      const dit = (kamer && (r.zoneId ?? r.meedoenMet?.zoneId) === kamer) || (ruimte && r.id === ruimte);
      return { ...k, stil: !!(kamer || ruimte) && !dit && !alles, doel: !!dit };
    },
  });
  const { etages } = t;
  const overZon = stand !== 'begin' && (nu?.soort === 'zon' || nu?.soort === 'straks');
  const zonKw = state?.bewoner?.stromen?.zonKw ?? 0;
  const model = {
    beschrijving: kamer ? `Het huis, met ${zoneNaam(kamer)} uitgelicht.` : 'Het huis.',
    tijd: app.tijdVanDeDag(zon),
    zon: zon?.dag ? { stand: zon.dag.fractie, hoogte: zon.dag.hoogteDeel, aandeel: overZon ? 0.9 : 0.4, panelen: t.panelen } : { aandeel: 0, panelen: t.panelen },
    etages,
    voordeur: t.voordeur,
    buitenunit: t.buitenunit,
    net: true,
    stromen: kamer && zonKw > 0.05 ? [{ van: 'zon', naar: `kamer:${etages.flatMap((e) => e.kamers).find((k) => k.doel)?.naam ?? ''}`, sterkte: 0.5 }] : [],
    labels: overZon && zonKw > 0.05 ? [{ bij: 'panelen', titel: `${nl(zonKw)} kW`, groot: true, toon: 'zon', regels: ['je panelen, nu'], dx: 40, dy: -60 }] : [],
  };
  if (!app.telStand()) huis.teken(document.getElementById('podium-wand'), model, { breedte: 420, hoogte: 480, marge: 0.03 });
  else huis.teken(document.getElementById('podium-tel'), { ...model, etages: etages.map((e) => ({ ...e, kamers: e.kamers.map((k) => ({ ...k, stil: k.stil || !k.doel })) })) }, { breedte: 360, hoogte: 240, marge: 0.04 });
}

function tekenNu() {
  app.schaal();
  app.luchtVan(zon, state?.bewoner?.stromen?.zonKw ?? 0);
  document.body.dataset.stand = stand;
  const al = gezegd;
  $$('[data-spraak]').forEach((el) => (el.innerHTML = spraakHtml()));
  if (stand === 'praat') zetGezegd(al);
  // Niet begrepen: voorbeelden om op te tikken; anders wat er logisch op volgt.
  const voorbeelden = (nu?.voorbeelden ?? []).map((t) => ({ label: t, hint: '', ik: 'nu', v: { soort: 'vrij', tekst: t } }));
  getoond = stand === 'verder' ? (voorbeelden.length ? voorbeelden : vervolg(nu)) : stand === 'begin' ? suggesties() : [];
  const nee = stand === 'verder' ? '<button type="button" class="sug nee" data-nee>Nee, dank je</button>' : '';
  $$('[data-suggesties]').forEach((el) => {
    el.innerHTML = getoond.map(sugHtml).join('') + nee;
    el.hidden = !getoond.length;
  });
  $$('[data-eerder]').forEach((el) => {
    el.hidden = !eerder.length || stand === 'begin';
    el.innerHTML = `Eerder: ${eerder.map((e, i) => `<button type="button" data-eerder-vraag="${i}">${esc(e.label)}</button>`).join('')}`;
  });
  $$('[data-tik]').forEach((el) => (el.textContent = tikOmTeHoren && stand === 'verder' ? 'Tik om te horen' : !ontgrendeld && voorlezen && stand === 'begin' ? 'Tik om te praten' : ''));
  // Twee soorten stoppen (besluit 148): het praten, en het scherm. Nooit dezelfde knop.
  const scherm = beweegtNog();
  $$('[data-stop]').forEach((el) => {
    el.hidden = stand !== 'praat';
    el.textContent = scherm ? 'Stil' : 'Stop';
    el.classList.toggle('zacht', !!scherm);
  });
  $$('[data-stopscherm]').forEach((el) => {
    el.hidden = !scherm;
    const naam = scherm?.naam ?? '';
    el.querySelector('span').textContent = `Stop ${/^(screen|zonnescherm|scherm)/i.test(naam) ? `het ${naam.charAt(0).toLowerCase()}${naam.slice(1)}` : naam}`;
  });
  // De microfoon alleen waar hij kan: over https (besluit 150).
  const micKan = !!window.luisteren?.kan();
  $$('[data-mic]').forEach((el) => (el.hidden = !micKan));
  $$('[data-vrij] input').forEach((el) => (el.placeholder = micKan ? 'Typ, of tik op de microfoon' : 'Typ wat je wilt'));
  $$('[data-voorlezen]').forEach((el) => {
    el.hidden = stand === 'praat';
    el.setAttribute('aria-pressed', String(voorlezen));
    el.querySelector('span').textContent = voorlezen ? 'Voorlezen aan' : 'Voorlezen uit';
    el.title = voorlezen ? (stemNaam ? 'Met Piper, in je eigen huis' : 'Met de stem van dit apparaat') : 'Alleen tekst';
  });
  if (stand !== 'praat') tekenGolf([]);
  tekenHuis();
}

/* -------------------------------------------------------------- starten */

/** Gebundeld: hooguit één keer per beeld (basis.js). */
const teken = app.gebundeld(tekenNu);
addEventListener('standwissel', teken);

app.start('assistent');
document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) {
    // Ergens tikken tijdens het praten: stoppen.
    if (stand === 'praat' && !e.target.closest('input, a')) stopPraten();
    return;
  }
  ontgrendeld = true;
  if (t.dataset.sug != null) return void vraag(getoond[Number(t.dataset.sug)].v && { ...getoond[Number(t.dataset.sug)].v, label: getoond[Number(t.dataset.sug)].label });
  if (t.hasAttribute('data-nee')) {
    eerder.unshift(nu);
    eerder.splice(4);
    nu = null;
    stand = 'begin';
    teken();
    void zeg('Prima. Ik ben er als je me nodig hebt.').then(() => {
      stand = 'begin';
      teken();
    });
    return;
  }
  if (t.hasAttribute('data-mic')) return void microfoonTik();
  if (t.hasAttribute('data-stop')) return stopPraten();
  if (t.hasAttribute('data-stopscherm')) {
    const scherm = beweegtNog();
    if (scherm) void vraag({ label: 'Stop', soort: 'vrij', tekst: `stop ${scherm.naam}` });
    return;
  }
  if (t.hasAttribute('data-voorlezen')) {
    voorlezen = !voorlezen;
    try {
      localStorage.setItem(VOORLEZEN, voorlezen ? 'aan' : 'uit');
    } catch {
      // Dan alleen nu.
    }
    teken();
    return;
  }
  if (t.dataset.eerderVraag != null) {
    const item = eerder[Number(t.dataset.eerderVraag)];
    if (item) void vraag({ soort: item.soort, kamer: item.kamer, tekst: item.tekst, label: item.label });
    return;
  }
  if (t.hasAttribute('data-kern')) {
    if (stand === 'praat') return stopPraten();
    // De bol: het huis begroet je, of herhaalt het laatste antwoord.
    if (nu?.antwoord && stand === 'verder') return void zeg(nu.antwoord, nu.gesproken ?? nu.antwoord);
    stand = 'begin';
    void zeg(`${groet()}. Waarmee kan ik je helpen?`).then(() => {
      stand = 'begin';
      teken();
    });
  }
});
addEventListener('keydown', (e) => e.key === 'Escape' && stand === 'praat' && stopPraten());
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-vrij]');
  if (!f) return;
  e.preventDefault();
  ontgrendeld = true;
  const veld = f.elements.tekst;
  const tekst = String(veld.value ?? '').trim().slice(0, 200);
  veld.value = '';
  veld.blur();
  if (tekst) void vraag({ label: tekst, soort: 'vrij', tekst });
});
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};
if (location.hash === '#typ') document.querySelector(`${app.zicht()} [data-vrij] input`)?.focus();
/*
 * De microfoon in de vraagbalk op Thuis (besluit 159): hier meteen luisteren.
 * Kan de microfoon hier niet, dan typen.
 */
if (location.hash === '#praat') {
  history.replaceState(null, '', location.pathname);
  if (window.luisteren?.kan()) void microfoonTik();
  else document.querySelector(`${app.zicht()} [data-vrij] input`)?.focus();
}
/** Een vraag uit het adres: #nu, #zon, #straks, #vandaag, #warm, #morgen, #kosten, #waarom/zolder. */
function vraagUitAdres() {
  const [soort, kamer] = decodeURIComponent(location.hash.slice(1)).split('/');
  const labels = { nu: 'Wat doe je nu?', zon: 'Hoeveel zon vandaag?', straks: 'Wat ga je straks doen?', vandaag: 'Wat deed je vandaag?', warm: 'Hoe warm is het overal?', morgen: 'Wat wordt het weer morgen?', kosten: 'Wat kosten de apparaten?' };
  // Een tik op Thuis bracht je hier: dan meteen hardop (opgelost 15 oktober).
  if (labels[soort] || (soort === 'waarom' && kamer)) vanAdres = true;
  if (labels[soort]) void vraag({ soort, label: labels[soort] });
  else if (soort === 'waarom' && kamer) void vraag({ soort, kamer, label: `Waarom ${zoneNaam(kamer)}?` });
}
addEventListener('hashchange', vraagUitAdres);
void laadAlles().then(vraagUitAdres);
setInterval(() => void laadAlles(), 60_000);
app.live((nieuw) => {
  state = nieuw;
  if (stand !== 'praat') teken();
});
