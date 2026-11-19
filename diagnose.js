import { readFileSync } from 'node:fs';

const manual = JSON.parse(readFileSync(new URL('./data/manual.json', import.meta.url), 'utf8'));

// El manual sale de procesar PDFs: las claves pueden traer espacios o minúsculas ("P0420 ").
// Se normalizan igual que lo que ingresa el mecánico, así matchean los dos lados.
const normalizeCode = (code) => code.trim().toUpperCase();

// Índice por vehículo, armado una sola vez al cargar el módulo.
const vehicles = new Map(
  manual.vehicles.map((v) => [
    v.id,
    {
      name: v.name,
      codes: new Map(Object.entries(v.codes).map(([code, entry]) => [normalizeCode(code), entry])),
      causes: v.causes,
    },
  ]),
);

// Evita que el ruido de coma flotante (1 − 0.55 = 0.44999999999999996) llegue al resultado.
const round = (n) => Math.round(n * 1e4) / 1e4;

/**
 * @param {{ vehicleId: string, codes: string[] }} input
 * @returns {{
 *   vehicle: string,
 *   codes: { code: string, description: string }[],
 *   notFound: string[],
 *   causes: {
 *     id: string, title: string, component: string, probability: number,
 *     codes: string[], steps: { text: string, expected: string }[]
 *   }[]
 * }}
 */
export function diagnose({ vehicleId, codes } = {}) {
  if (typeof vehicleId !== 'string' || vehicleId.trim() === '') {
    throw new TypeError('vehicleId es obligatorio y no puede estar vacío');
  }
  if (!Array.isArray(codes)) {
    throw new TypeError('codes tiene que ser un array');
  }
  if (codes.some((c) => typeof c !== 'string' || c.trim() === '')) {
    throw new TypeError('codes no puede tener códigos vacíos o que no sean texto');
  }

  const vehicle = vehicles.get(vehicleId);
  if (!vehicle) {
    throw new Error(`Vehículo no encontrado: ${vehicleId}`);
  }

  // Sin duplicados y ordenados: el resultado no depende del orden de entrada.
  const uniqueCodes = [...new Set(codes.map(normalizeCode))].sort();

  const found = [];
  const notFound = [];
  // Por causa: probabilidad de que NO sea esa causa según cada código (noisy-OR) y qué códigos la señalan.
  const byCause = new Map();

  for (const code of uniqueCodes) {
    const entry = vehicle.codes.get(code);
    if (!entry) {
      notFound.push(code);
      continue;
    }
    found.push({ code, description: entry.description });

    for (const { cause, probability } of entry.causes) {
      // Causa referenciada pero sin detalle en el manual (p. ej. sonda-anterior del Tiggo):
      // sin título ni pasos no le sirve al mecánico, se excluye.
      if (!vehicle.causes[cause]) continue;

      const acc = byCause.get(cause) ?? { notProbability: 1, codes: [] };
      acc.notProbability *= 1 - probability;
      acc.codes.push(code);
      byCause.set(cause, acc);
    }
  }

  const causes = [...byCause].map(([id, acc]) => {
    const { title, component, steps } = vehicle.causes[id];
    return {
      id,
      title,
      component,
      probability: round(1 - acc.notProbability),
      codes: acc.codes,
      steps: steps.map((s) => ({ ...s })), // copia: mutar el resultado no toca el manual
    };
  });

  // Más probable primero; a igual probabilidad, por id (orden neutro y determinístico).
  causes.sort((a, b) => b.probability - a.probability || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { vehicle: vehicle.name, codes: found, notFound, causes };
}
