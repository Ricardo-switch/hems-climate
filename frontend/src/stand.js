/*
 * Hoe het huis ervoor staat (besluit 130): wat er nog mist in de instellingen,
 * en waar elke instelling staat om ernaar te zoeken. Voor de hoofdpagina van
 * Instellingen en voor Wat je huis kan; uit wat de dienst al geeft.
 */
'use strict';

(function (global) {
  /** Waar elke groep staat. */
  const GROEPEN = {
    huis: 'indeling.html',
    comfort: 'comfort.html',
    energie: 'energie.html',
    regeling: 'regeling.html',
    functies: 'functies.html',
    toegang: 'toegang.html',
  };

  /**
   * Wat er nog mist: elk met waarom het telt en een knop ernaartoe. Alleen wat
   * Smart Climate echt nodig heeft; wat erbij kan, staat bij Wat je huis kan.
   */
  function nogTeDoen(d) {
    const uit = [];
    const e = d.energie?.instellingen;
    const p = e?.prijzen;
    if (d.energie && (e == null || (e.net?.afname ?? []).length === 0)) {
      uit.push({ id: 'meters', groep: 'energie', wat: 'Je meters zijn nog niet gekozen', waarom: 'Zonder stroommeter weet Opbrengst niet wat je huis gebruikt.', knop: 'Kiezen', href: 'energie.html#meters' });
    }
    if (e && p?.stroom == null) {
      uit.push({ id: 'stroomprijs', groep: 'energie', wat: 'De stroomprijs ontbreekt', waarom: "Zonder prijs rekent Opbrengst in kWh, niet in euro's.", knop: 'Invullen', href: 'energie.html#prijzen' });
    }
    if (e && e.gas && p?.gas == null) {
      uit.push({ id: 'gasprijs', groep: 'energie', wat: 'De gasprijs ontbreekt', waarom: 'Je hebt een gasmeter; zonder prijs telt het gas niet mee in je kosten.', knop: 'Invullen', href: 'energie.html#prijzen' });
    }
    const a = d.aansluiting;
    if (a && a.antwoorden?.zekering == null && a.configuratie?.zekering == null) {
      uit.push({ id: 'zekering', groep: 'energie', wat: 'De hoofdzekering ontbreekt', waarom: 'Dan let het huis er niet op dat alles samen nooit meer vraagt dan je aansluiting aankan.', knop: 'Kiezen', href: 'energie.html#aansluiting' });
    }
    if (a && a.antwoorden?.panelen?.ligging == null && !(a.configuratie?.panelen ?? []).length) {
      uit.push({ id: 'panelen', groep: 'energie', wat: 'Waar je panelen liggen', waarom: 'Daarmee rekent het huis uit wanneer er zon op je dak valt.', knop: 'Kiezen', href: 'energie.html#panelen' });
    }
    const zonder = d.huis?.zonderRuimte?.length ?? 0;
    if (zonder > 0) {
      const namen = d.huis.zonderRuimte.slice(0, 2).map((x) => x.naam).join(' en ');
      uit.push({ id: 'indelen', groep: 'huis', wat: `${zonder === 1 ? '1 apparaat staat' : `${zonder} apparaten staan`} nog in geen kamer`, waarom: `${namen}${zonder > 2 ? ', en meer' : ''}, uit Home Assistant.`, knop: 'Indelen', href: 'indeling.html' });
    }
    return uit;
  }

  /**
   * Om te zoeken: elke instelling, met de woorden waarop je hem vindt. Het
   * adres wijst naar het deel van de groep.
   */
  const ZOEK = [
    { titel: 'Temperatuur per kamer', waar: 'Comfort', href: 'comfort.html', woorden: 'temperatuur warm koel koud graden kamer comfort verwarmen koelen' },
    { titel: 'Nooit warmer dan', waar: 'Comfort', href: 'comfort.html', woorden: 'plafond maximum heet warm airco net' },
    { titel: 'Dagdelen: voorverwarmen, dag en nacht', waar: 'Comfort', href: 'comfort.html#dagdelen', woorden: 'dag nacht ochtend avond uur tijd schema voorverwarmen' },
    { titel: 'Afwezig en vakantie', waar: 'Comfort', href: 'comfort.html#afwezig', woorden: 'afwezig vakantie weg thuis' },
    { titel: 'Zonnepanelen', waar: 'Energie', href: 'energie.html#panelen', woorden: 'panelen zon dak ligging oost west zonnesensor omvormer' },
    { titel: 'Hoofdzekering', waar: 'Energie', href: 'energie.html#aansluiting', woorden: 'zekering ampere fase aansluiting meterkast' },
    { titel: 'Meters', waar: 'Energie', href: 'energie.html#meters', woorden: 'meter p1 stroom gas teruglevering kwh energie dashboard' },
    { titel: 'Contract en prijzen', waar: 'Energie', href: 'energie.html#prijzen', woorden: 'prijs tarief contract stroomprijs gasprijs vast dynamisch vaste kosten leverancier saldering kwh euro' },
    { titel: 'Verwarming en aanvoertemperatuur', waar: 'Energie', href: 'energie.html#verwarming', woorden: 'cv ketel warmtepomp aanvoer stadsverwarming' },
    { titel: 'Wie wat regelt', waar: 'Regeling', href: 'regeling.html', woorden: 'regelen meekijken schakelen airco cv thermostaat' },
    { titel: 'Apparaten op zon', waar: 'Regeling', href: 'regeling.html#opzon', woorden: 'droger wasmachine vaatwasser zon uitstellen' },
    { titel: 'Kamers en etages', waar: 'Je huis', href: 'indeling.html', woorden: 'kamer etage indeling verdieping zolder' },
    { titel: 'Meten met', waar: 'Je huis', href: 'indeling.html', woorden: 'sensor thermometer meten temperatuur gemiddelde' },
    { titel: "Camera's", waar: 'Functies', href: 'functies.html#cameras', woorden: 'camera beeld oprit' },
    { titel: 'Deurbel', waar: 'Functies', href: 'functies.html#deurbel', woorden: 'deurbel bel aanbellen bezoeker scherm' },
    { titel: 'Licht en screens bedienen', waar: 'Functies', href: 'functies.html#licht', woorden: 'licht lamp scene screen zonnescherm bedienen' },
    { titel: 'Weer', waar: 'Functies', href: 'functies.html#weer', woorden: 'weer buienradar open-meteo verwachting uur' },
    { titel: 'Inloggen', waar: 'App en toegang', href: 'toegang.html', woorden: 'inloggen uitloggen account wachtwoord toegang' },
    { titel: 'Je gegevens exporteren', waar: 'App en toegang', href: 'toegang.html#gegevens', woorden: 'export gegevens dataset download' },
  ];

  function zoek(tekst) {
    const t = tekst.trim().toLowerCase();
    if (t.length < 2) return [];
    return ZOEK.filter((z) => `${z.titel} ${z.woorden}`.toLowerCase().includes(t)).slice(0, 6);
  }

  /* ------------------------------------------------- wat je huis kan */

  const LABEL = { werkt: 'Werkt', leert: 'Leert nog', kijkt: 'Kijkt mee', uit: 'Staat uit' };

  /**
   * Wat een thuisbatterij zou opleveren, uit de maand in Opbrengst: wat er
   * overdag naar het net ging en 's avonds terugkwam. Zolang er gesaldeerd
   * wordt bijna niets; vanaf 2027 het verschil tussen je stroomprijs en wat je
   * voor teruglevering krijgt, plus de terugleverkosten. Een schatting.
   */
  function batterijSom(d) {
    const s = d.opbrengst?.stroom;
    const p = d.energie?.instellingen?.prijzen;
    if (!s || p?.stroom == null) return null;
    const kwh = Math.min(s.terugKwh ?? 0, s.vanNetKwh ?? 0) * 0.85;
    const na2027 = p.stroom - (p.vanaf2027?.vergoeding ?? 0) + (p.vanaf2027?.kosten ?? 0);
    if (kwh < 1 || na2027 <= 0) return null;
    return { kwh: Math.round(kwh), euro: Math.round(kwh * na2027), maand: d.opbrengst.periode?.label?.split(' ')[0]?.toLowerCase() ?? 'deze maand', terugKwh: Math.round(s.terugKwh) };
  }

  /**
   * Alles wat Smart Climate voor je doet, per onderwerp, met een stand: werkt,
   * kijkt mee (de schaduw, besluit 64: tot het zelf regelt), leert nog, staat
   * uit, vul in (een instelling mist) of nodig (er hoort iets bij). De regel
   * "nu" zegt wat het op dit moment doet. Alleen wat bij dit huis kan bestaan.
   */
  function kan(d) {
    const alles = (d.huis?.etages ?? []).flatMap((e) => e.ruimtes ?? []).flatMap((r) => r.apparaten ?? []);
    const acts = d.site?.actuators ?? [];
    const airco = acts.some((x) => x.capabilities?.canCool);
    const panelen = (d.zon?.panelen ?? []).length > 0 || (d.aansluiting?.configuratie?.panelen ?? []).length > 0;
    // Klimaat kijkt mee tot het zelf regelt (besluit 64); dan wordt het "werkt".
    const meekijk = 'kijkt';
    const kamers = d.state?.bewoner?.kamers ?? [];
    const goed = kamers.filter((k) => k.soort === 'ok').length;
    const f = d.functies?.instellingen ?? d.functies?.voorstel;
    const e = d.energie?.instellingen;
    const p = e?.prijzen;
    const winter = d.divergence?.dataset?.seizoenen?.find((x) => x.seizoen === 'winter');
    const bewijs = winter ? `${winter.dagen} van ${winter.doel} winterdagen` : null;
    const knoppen = alles.filter((x) => x.radiatorknop);
    const lampenAan = alles.filter((x) => x.soort === 'licht' && x.aan).length;
    const screens = alles.filter((x) => x.soort === 'screen');
    const leegB = (d.huis?.batterijen ?? []).filter((b) => b.pct < 10).length;
    const volF = (d.huis?.filters ?? []).length;
    const z = d.aansluiting?.antwoorden?.zekering ?? d.aansluiting?.configuratie?.zekering;
    const opZon = Object.values(d.aansluiting?.antwoorden?.opZon ?? {}).filter(Boolean).length + (d.aansluiting?.configuratie?.apparaten?.length ?? 0);
    const kanOpZon = (d.aansluiting?.gevonden?.apparaten ?? []).length;
    const accu = batterijSom(d);
    const kop = d.state?.bewoner?.kop?.titel;
    const weerNaam = (d.functies?.gevonden?.weerbronnen ?? []).find((b) => b.id === f?.weer?.bron)?.naam?.replace(' (via internet)', '');
    const dagen = d.divergence?.dataset?.dagenOpgenomen != null ? Math.round(d.divergence.dataset.dagenOpgenomen) : null;
    const zonderMeter = d.energie && (e?.net?.afname ?? []).length === 0;
    const zonderPrijs = d.energie && !zonderMeter && p?.stroom == null;

    const lijst = [
      // Comfort
      {
        id: 'temperatuur', groep: 'comfort', titel: 'Elke kamer op temperatuur', stand: acts.length ? meekijk : 'nodig', label: acts.length ? null : 'Airco of thermostaat nodig',
        nu: kamers.length ? `${goed} van ${kamers.length} kamers goed${bewijs ? `, ${bewijs}` : ''}` : 'wat je wilt per kamer', href: 'comfort.html',
        wat: 'Elke kamer warm of koel genoeg, zoals jij het per dagdeel instelt.',
        zo: ['Per kamer verwarmen onder en koelen boven een temperatuur', 'De goedkoopste manier eerst: de zon, dan het net', 'Bij elk besluit staat waarom'],
        wanneer: ['Een kamer is kouder of warmer dan je comfort', 'Kijkt mee: het huis zegt wat het zou doen, tot het na 30 winterdagen zelf regelt'],
      },
      {
        id: 'optijd', groep: 'comfort', titel: 'Op tijd warm of koel', stand: 'leert', nu: dagen ? `${dagen} dagen gemeten` : 'meet hoe elke kamer opwarmt', href: 'vandaag.html',
        wat: 'Het huis leert hoe snel elke kamer opwarmt en afkoelt, en begint dan precies op tijd.',
        zo: ['Het meet elke kamer, het weer per uur en wat de apparaten doen', 'Daaruit rekent het vooruit: wanneer moet de cv aan voor 20° om zeven uur', 'Met zon in de verwachting koelt het eerder, op eigen stroom'],
        wanneer: ['Na genoeg dagen met verschillend weer', 'Per kamer: een kamer die het al kent, doet al mee'],
      },
      {
        id: 'perkamer', groep: 'comfort', titel: 'Verwarmen per kamer', stand: knoppen.length ? meekijk : 'nodig', label: knoppen.length ? null : 'Radiatorknoppen nodig',
        nu: knoppen.length ? `${knoppen.length} radiatorknop${knoppen.length === 1 ? '' : 'pen'}` : 'een eigen temperatuur per kamer', href: 'indeling.html',
        wat: 'Met slimme radiatorknoppen krijgt elke kamer zijn eigen temperatuur, ook met één cv-ketel.',
        zo: ['De knop houdt de radiator dicht in een kamer die warm genoeg is', 'De cv brandt alleen als een kamer warmte vraagt', 'Zigbee-knoppen zoals de Sonoff TRVZB werken via Home Assistant'],
        wanneer: ['De knoppen zijn gekoppeld in Home Assistant', 'Je kiest bij Indeling welke kamer welke knop heeft'],
      },
      {
        id: 'gevoel', groep: 'comfort', titel: 'Leert wat jij prettig vindt', stand: 'werkt', nu: 'tik op Thuis hoe het voelt', href: 'thuis.html',
        wat: 'Tik op Thuis of het te koud, goed of te warm is. Het huis legt het naast de temperatuur van dat moment.',
        zo: ['Elke tik wordt bewaard, met de temperatuur en het dagdeel', 'Tik je vaak "te koud" bij dezelfde temperatuur, dan stelt het huis een warmere voor'],
        wanneer: ['Altijd: tik wanneer je iets voelt'],
      },
      // Zon en kosten
      ...(airco ? [{
        id: 'opzon', groep: 'zon', titel: 'Koelen en verwarmen op zon', stand: panelen ? meekijk : 'nodig', label: panelen ? null : 'Zonnepanelen nodig',
        nu: panelen ? (kop ?? 'wacht op zon over') : 'airco op je eigen stroom', href: 'vandaag.html',
        wat: "De airco's draaien op de stroom van je eigen dak, als een kamer het nodig heeft. Wat er over is, gaat niet voor weinig naar het net.",
        zo: ['Elke paar minuten kijkt het huis hoeveel zon er over is', 'Is het genoeg, dan gaat de kamer die het meest nodig heeft voor', 'Wordt het bewolkt, dan stopt de airco rustig, niet meteen'],
        wanneer: ['Er is genoeg zon over voor een airco', 'Een kamer is warmer of kouder dan je comfort'],
      }] : []),
      {
        id: 'apparaten', groep: 'zon', titel: 'Apparaten op zon', stand: opZon ? meekijk : kanOpZon ? 'uit' : 'nodig', label: opZon || kanOpZon ? null : 'Slim apparaat nodig',
        nu: opZon ? 'start als er zon over is' : kanOpZon ? 'zet het aan bij Regeling' : 'een droger die op afstand start', href: 'regeling.html#opzon',
        wat: 'Een droger, wasmachine of vaatwasser wacht op zon, en is toch klaar op de tijd die jij kiest.',
        zo: ['Jij zegt hoe laat hij klaar moet zijn', 'Het huis start hem als er genoeg zon over is', 'Komt er geen zon, dan start hij op tijd van het net'],
        wanneer: ['"Op afstand starten" staat aan op het apparaat', 'Het apparaat staat bij Regeling op zon'],
      },
      {
        id: 'batterij', groep: 'zon', titel: 'Thuisbatterij', stand: 'nodig', label: 'Batterij nodig', nu: accu ? `vanaf 2027 ± € ${accu.euro} per maand voor jou` : 'zon van de middag voor de avond', href: 'opbrengst.html',
        wat: 'Zon van de middag bewaren voor de avond, in plaats van hem voor weinig aan het net te geven.',
        zo: ['Laden met wat de airco’s overlaten', "'s Avonds leeg naar je eigen huis, niet naar het net", 'Nooit meer tegelijk dan je zekering aankan'],
        wanneer: ['Er is een batterij die Home Assistant kan sturen'], som: accu,
      },
      ...(d.aansluiting?.antwoorden?.tarief !== 'dynamisch' ? [{
        id: 'goedkoop', groep: 'zon', titel: 'Goedkope uren', stand: 'nodig', label: 'Ander contract', nu: 'koelen en wassen als stroom goedkoop is', href: 'energie.html#prijzen',
        wat: 'Met een contract met een prijs per uur kan het huis koelen, verwarmen en wassen als stroom goedkoop is.',
        zo: ['Het huis kent de prijzen van morgen al vandaag', 'Het schuift wat kan schuiven naar de goedkoopste uren'],
        wanneer: ['Je hebt een dynamisch contract, en zet dat bij Energie'],
      }] : []),
      {
        id: 'auto', groep: 'zon', titel: 'De auto op zon', stand: 'nodig', label: 'Laadpaal nodig', nu: 'laden met wat er over is', href: 'opbrengst.html',
        wat: 'De auto laadt met de zon die er over is, en is toch vol op de tijd die jij kiest.',
        zo: ['Laden als er zon over is, samen met de airco’s', 'Vol op tijd, desnoods van het net'],
        wanneer: ['Er is een laadpaal die via evcc in Home Assistant hangt'],
      },
      // Gemak
      {
        id: 'licht', groep: 'gemak', titel: 'Licht en scènes', stand: d.functies?.lichtMogelijk && f?.licht?.bedienen !== false ? 'werkt' : 'uit',
        nu: lampenAan ? `${lampenAan} ${lampenAan === 1 ? 'lamp' : 'lampen'} aan` : 'alles uit', href: 'functies.html#licht',
        wat: 'Lampen en scènes aan en uit in de app, per kamer, met de kleuren van je Hue-scènes.',
        zo: ['Tik op een kamer en dan op een lamp of scène', 'De regeling raakt je lampen niet aan'],
        wanneer: ['Bedienen staat aan bij Functies', 'Je bent ingelogd met je Home Assistant-account'],
      },
      ...(screens.length ? [{
        id: 'screens', groep: 'gemak', titel: 'Screens en zonnescherm', stand: d.functies?.schermMogelijk && f?.schermen?.bedienen !== false ? 'werkt' : 'uit',
        nu: `${screens.length} ${screens.length === 1 ? 'scherm' : 'schermen'}`, href: 'functies.html#licht',
        wat: 'Je screens en zonnescherm open en dicht in de app. Een screen met terugmelding sleep je naar elke stand.',
        zo: ['Tik op een kamer en dan op het screen', 'Een scherm zonder terugmelding toont de laatste opdracht'],
        wanneer: ['Bedienen staat aan bij Functies'],
      }] : []),
      {
        id: 'afwezig', groep: 'gemak', titel: 'Afwezig en vakantie', stand: meekijk, nu: 'vanzelf als niemand thuis is', href: 'comfort.html#afwezig',
        wat: 'Is niemand thuis, dan houdt het huis een zuinigere temperatuur aan. Vakantie zet je zelf.',
        zo: ['Het huis ziet in Home Assistant wie er thuis is', 'Per kamer staat wat het dan aanhoudt'],
        wanneer: ['Niemand is thuis, of jij zet vakantie aan op Thuis'],
      },
      {
        id: 'vraag', groep: 'gemak', titel: 'Vraag het je huis', stand: 'werkt', nu: '"waarom koelt de zolder?"', href: 'assistent.html',
        wat: 'Vraag wat het huis doet en waarom, en hoeveel zon er vandaag komt.',
        zo: ['De antwoorden komen uit wat het huis meet en besluit', 'Typ een vraag, of tik er een aan'],
        wanneer: ['Altijd'],
      },
      // Overzicht
      {
        id: 'opbrengst', groep: 'overzicht', titel: 'Opbrengst en kosten', stand: zonderMeter || zonderPrijs ? 'mis' : 'werkt', label: zonderMeter ? 'Meters' : zonderPrijs ? 'Stroomprijs' : null,
        nu: zonderMeter ? 'kies je meters' : zonderPrijs ? "kWh klopt, euro's nog niet" : d.opbrengst?.stroom ? `${d.opbrengst.stroom.eigenZonPct}% van je eigen dak` : 'wat je gebruikt en wat het kost',
        href: zonderMeter ? 'energie.html#meters' : zonderPrijs ? 'energie.html#prijzen' : 'opbrengst.html',
        wat: 'Wat je huis gebruikt, wat je panelen leveren en wat het kost, per dag, week, maand en contractjaar.',
        zo: ['Uit je meters in Home Assistant', 'Met de prijzen van je contract'],
        wanneer: ['Je meters en prijzen staan bij Energie'],
      },
      {
        id: 'zekering', groep: 'overzicht', titel: 'Nooit meer dan je zekering', stand: z ? meekijk : 'mis', label: z ? null : 'Zekering',
        nu: z ? `${z.fasen} × ${z.ampere} A` : 'kies je hoofdzekering', href: 'energie.html#aansluiting',
        wat: 'Het huis zet nooit zoveel tegelijk aan dat de hoofdzekering eruit gaat.',
        zo: ['Het telt wat er al draait, per fase', 'Een airco wacht als het te krap wordt'],
        wanneer: ['Je hoofdzekering staat bij Energie'],
      },
      ...((d.functies?.gevonden?.cameras ?? []).length ? [{
        id: 'camera', groep: 'overzicht', titel: "Camera's en deurbel", stand: f?.cameras?.aan || f?.deurbel?.aan ? 'werkt' : 'uit',
        nu: f?.deurbel?.aan ? 'beeld op elk scherm als er wordt aangebeld' : 'beeld in de kamer', href: 'functies.html#cameras',
        wat: 'Je camera’s in de kamer waar ze hangen, en bij de deurbel meteen het beeld op elk scherm.',
        zo: ['Wordt er aangebeld, dan toont elke open pagina het beeld', 'Smart Climate kijkt alleen: er gaat niets naar de camera'],
        wanneer: ["Camera's en deurbel staan aan bij Functies"],
      }] : []),
      {
        id: 'batterijen', groep: 'overzicht', titel: 'Batterijen en filters', stand: 'werkt', nu: leegB || volF ? [leegB ? `${leegB} ${leegB === 1 ? 'batterij' : 'batterijen'} bijna leeg` : null, volF ? `${volF} ${volF === 1 ? 'filter' : 'filters'} vol` : null].filter(Boolean).join(', ') : 'alles in orde', href: 'thuis.html',
        wat: 'Een batterij onder 10% of een vol airco-filter staat op Thuis, met een tik naar het apparaat.',
        zo: ['Alle kleine apparaten met een batterij, ook knoppen die de app verder niet gebruikt', 'Telefoons, een thuisbatterij en een auto tellen niet mee'],
        wanneer: ['Altijd'],
      },
      {
        id: 'weer', groep: 'overzicht', titel: 'Weer en zon', stand: f?.weer?.bron ? 'werkt' : 'uit', nu: weerNaam ? `van ${weerNaam}` : 'kies een weerbron', href: 'functies.html#weer',
        wat: 'Het weer per uur en per dag, en wat je panelen dan naar verwachting leveren.',
        zo: ['De verwachting leert van je eigen panelen', 'Elk uur wordt de verwachting bewaard, voor het thermisch model'],
        wanneer: ['Er is een weerbron gekozen bij Functies'],
      },
    ];
    return lijst.map((x) => ({ ...x, label: x.label ?? LABEL[x.stand] ?? x.stand }));
  }

  global.stand = { GROEPEN, nogTeDoen, zoek, kan, batterijSom };
})(window);
