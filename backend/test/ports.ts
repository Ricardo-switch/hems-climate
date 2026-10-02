/**
 * Een vrije poort die fetch en WebSocket ook echt willen bereiken.
 *
 * Een testserver op poort 0 krijgt van het besturingssysteem een willekeurige
 * vrije poort. Op Windows begint die reeks bij 1024 (`netsh int ipv4 show
 * dynamicport tcp`), en daar zitten poorten tussen die de Fetch-standaard
 * blokkeert: 5060, 6000, 6665 tot 6669, 10080 en nog wat. Node's fetch en zijn
 * ingebouwde WebSocket weigeren die zonder te verbinden ("bad port"), en
 * Chromium doet hetzelfde. De client van de schaduwdienst ziet dan alleen een
 * gesloten verbinding, probeert het na 1, 2 en 4 seconden opnieuw op dezelfde
 * poort, en de test loopt tegen zijn tijdslimiet. Eén keer op de zoveel
 * volledige runs, en los gedraaid nooit.
 */

/** De lijst uit de Fetch-standaard; precies wat Node 24 weigert. */
const BLOCKED_PORTS = new Set([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95,
  101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161,
  179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563,
  587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060,
  5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

export function isBlockedPort(port: number): boolean {
  return BLOCKED_PORTS.has(port);
}

/**
 * Opent een server op poort 0 tot hij een poort krijgt die niet geblokkeerd is.
 *
 * Een geweigerde server blijft open tot er een goede is: zolang hij die poort
 * vasthoudt, kan het besturingssysteem hem niet nog eens uitdelen. Zo eindigt
 * de lus altijd, en meestal meteen.
 */
export async function onUsablePort<T>(
  open: () => Promise<T>,
  portOf: (server: T) => number,
  close: (server: T) => Promise<void>,
): Promise<T> {
  const refused: T[] = [];
  try {
    for (;;) {
      const server = await open();
      if (!isBlockedPort(portOf(server))) return server;
      refused.push(server);
    }
  } finally {
    for (const server of refused) await close(server);
  }
}
