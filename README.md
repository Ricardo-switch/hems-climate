<p align="center"><img src="frontend/kit/merk.svg" alt="" width="180"></p>

<h1 align="center">SunArc</h1>

<p align="center"><sub>AUTONOMOUS RESIDENTIAL CLIMATE</sub></p>

<p align="center"><b>Climate and sun in one app, for Home Assistant.</b><br>
Your home thinks along with the sun: it watches your heating, air conditioners and solar panels,<br>
and explains every decision it makes.</p>

<p align="center">
<a href="https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FRicardo-switch%2Fhems-climate"><img src="https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg" alt="Add the repository to your Home Assistant"></a>
</p>

<p align="center">
<img alt="Version" src="https://img.shields.io/badge/dynamic/yaml?url=https%3A%2F%2Fraw.githubusercontent.com%2FRicardo-switch%2Fhems-climate%2Fmain%2Faddon%2Fconfig.yaml&query=%24.version&label=version&color=f7b548">
<img alt="Stage: experimental" src="https://img.shields.io/badge/stage-experimental-e58a3a">
<img alt="aarch64 and amd64" src="https://img.shields.io/badge/arch-aarch64%20%7C%20amd64-6fd3ff">
<img alt="License AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-8f86ff">
</p>

<p align="center"><b>English</b> · <a href="README.nl.md">Nederlands</a></p>

<p align="center"><img src="design/app2/screens/Wand-Thuis.png" alt="Home on a wall tablet: the house in 3D, with the sun, the solar panels and the temperature in every room" width="900"></p>

<p align="center"><sub>Images from the design, in Dutch. What the app already does and what is still to come is described below.</sub></p>

---

## What is it?

SunArc is a Home Assistant add-on with its own app for a wall tablet and your phone. It takes your home from Home Assistant (floors, rooms, devices, sensors) and draws it as an open dollhouse. At a glance you see what is going on: where it is warm, what is running and how much sun your panels deliver.

Behind the app is a controller that decides, round after round, what the house should do. Comfort comes first, and spare sun goes to your own home before it goes to the grid. Every decision comes with the reason, in plain words.

**Honest about where it stands:** SunArc is watching. It decides and records everything, but it does not control your heating and air conditioners on its own yet. Real control comes after a full winter of watching, with a report that proves it does better than your current setup. That is why the add-on is marked *experimental*. Lights, scenes and blinds can already be controlled from the app, and so can climate by hand, always with an end time.

## What it does

**Your home in one picture**
- The house in 3D, built from what Home Assistant already knows. You arrange it by floor, room and zone.
- Per room the temperature, what is heating or cooling, and which sensors count.
- Sensor batteries and the air conditioner filter, with a reminder when it is time.

**Comfort and sun**
- Comfort per room and per part of the day, and per resident: the first one home, in your order, sets the comfort.
- A power budget per phase, so your main fuse holds.
- When the dryer would start on sun, with a deadline you choose.
- The weather for today and five days ahead, with what your panels will deliver. The house learns how much sun your roof catches on a clear day.
- **Learning:** how fast your home cools down and warms up, and what the sun adds.

**Looking back**
- **Today:** the day on a timeline, with what the house did and why.
- **Yield** per day, week, month or year, with the prices of your own contract (peak and off-peak, net metering and after).
- The solar forecast next to what actually came.
- No home battery? The app replays the past year hour by hour, with the size that fits your home.

**Control and ask**
- Lights, Hue scenes and blinds, with one tap.
- **Climate by hand:** the thermostat or an air conditioner until a time, then back to your schedule.
- **Fixed and planned:** "every weekday, a quarter of an hour before sunset, close the blinds", and the house keeps doing it.
- Cameras per room, and the doorbell image when someone rings.
- **The assistant:** ask in your own words ("why is the attic waiting?") and the house answers, out loud with the voice from Home Assistant. On the wall with a wake word, on the phone with the microphone.

**Yours**
- Everything runs in your own home. Your data goes nowhere; only the weather forecast is fetched.
- You sign in with your Home Assistant account. Every resident has their own place, and a wall tablet is simply a screen.
- A backup of your settings in one small file, and restoring it.
- The app speaks English and Dutch.

<table>
<tr>
<td width="50%"><img src="design/app2/screens/Wand-Vandaag.png" alt="Today: the sun, the temperature and per device when it ran, with why"></td>
<td width="50%"><img src="design/app2/screens/Wand-Assistent-Gesprek.png" alt="The assistant: asking your home a question"></td>
</tr>
<tr>
<td><sub><b>Today</b>: what the house did, and why.</sub></td>
<td><sub><b>The assistant</b>: ask your home.</sub></td>
</tr>
<tr>
<td><img src="design/app2/screens/Wand-Welkom.png" alt="The welcome in a new home, with the house growing from Home Assistant"></td>
<td align="center"><img src="design/app2/screens/Thuis.png" alt="Home on the phone" width="220"></td>
</tr>
<tr>
<td><sub><b>Welcome</b>: your home grows from what Home Assistant knows.</sub></td>
<td align="center"><sub><b>On your phone</b>: the same app.</sub></td>
</tr>
</table>

## What is still to come

- **Real control** of heating and air conditioners, after a winter of watching with thirty winter days of evidence.
- What the house learns this winter about your boiler and ventilation, used by the controller itself.

SunArc shows a home battery and an EV charger, but does not steer them itself.

## Install

You need Home Assistant with add-ons (Home Assistant OS or Supervised), on a Raspberry Pi or a regular PC (aarch64 or amd64).

1. Tap the **Add repository** button above. Or go to **Settings → Add-ons → Add-on store**, choose the three dots at the top right → **Repositories**, and add:
   ```
   https://github.com/Ricardo-switch/hems-climate
   ```
2. Choose **SunArc** → **Install**, then **Start**. Turn on **Show in sidebar**.
3. Open SunArc in the sidebar. A new home starts with a welcome: your house grows from what Home Assistant knows, and one button starts the setup. It takes about ten minutes.

Updates come through Home Assistant. Turn on **Auto update** on the add-on page if you want them to arrive by themselves. What is new in each version is in the [releases](https://github.com/Ricardo-switch/hems-climate/releases) and in the add-on itself.

### Ask SunArc through Assist

To ask SunArc through Home Assistant's Assist ("why is the attic running?", "what are you doing?"), you need the **SunArc** integration. No YAML: the add-on announces itself.

- **Without HACS:** open SunArc → **Settings → Residents and access → Key for the assistant** and tap **Put the integration in Home Assistant**. Then restart Home Assistant.
- **With HACS:** in HACS choose the three dots → **Custom repositories**, add `https://github.com/Ricardo-switch/hems-climate` as an **Integration**, install **SunArc** and restart Home Assistant.

Home Assistant then shows **New device discovered: SunArc**; click **Add**. You do this once: later SunArc updates need no restart, because the sentences and answers come from the add-on. The integration has its own version, which only goes up when it changes itself.

Does it work with your devices? SunArc works with what your home has. An air conditioner, a thermostat, a smart meter, panels of any brand: it does what your setup allows, and **What your home can do** tells you what it cannot do (yet) because of that.

## Safe

- The app sits behind the Home Assistant login (Ingress). No port is open, unless you turn on the separate port for Tailscale yourself.
- Its own AppArmor profile: security rating 8, the highest.
- The images are built on GitHub and signed with Cosign.
- SunArc writes to Home Assistant only through narrow doors: lights, scenes, blinds, and climate by hand with an end time. A test proves nothing else gets through. Why the add-on may write to the Home Assistant configuration is explained in the add-on documentation.
- Found a weakness? See [SECURITY.md](SECURITY.md).

## How it works

- **A pure core.** Strategies each make a proposal (comfort, heat assist, spare sun), and one arbiter decides within a power budget. The core does no input or output and reads no clock, so every decision can be recomputed.
- **Everything is recorded.** Every decision, with the state of the house and the version that made it. That is where the evidence for real control comes from.
- **What differs per home is a setting**, not code. What Home Assistant already knows, the app suggests; you confirm.

The project is written in Dutch, including the decision log. Read more:
- [STAND.md](STAND.md): how each part works today.
- [DECISIONS.md](DECISIONS.md): every decision, with why and what it cost.
- [Architecture.md](Architecture.md): how it is built.
- [design/app2](design/app2): the sketches of the app. The sketch is the code: the app draws the house with the same files.
- [docs/oude-regeling](docs/oude-regeling): the YAML setup that SunArc replaces.

## Contributing

The service is TypeScript on Node 22, the app plain HTML and JavaScript with Tailwind.

```bash
cd backend && npm ci && npm test
```

Work goes to `beta`. CI checks every push (typecheck, lint, tests, the page in a browser and the image), and only a pull request goes to `main`. `main` is what Home Assistant installs. A bug or an idea? Open an [issue](https://github.com/Ricardo-switch/hems-climate/issues/new/choose); English or Dutch.

## License

SunArc is free software under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0). You may use, change and share it. Anyone who distributes a changed version, or offers it as a service or on a device, shares the source code under the same license.

The name SunArc and the mark are not covered by this license.

From others, each with its own license:

- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase, MIT: the QR code for residents.
- The typefaces [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) and [Figtree](https://fonts.google.com/specimen/Figtree), SIL Open Font License 1.1.
- The two front stages of the wake word from [openWakeWord](https://github.com/dscripka/openWakeWord) (`melspectrogram.onnx` and `embedding_model.onnx`), CC BY-NC-SA 4.0: not for commercial use.
