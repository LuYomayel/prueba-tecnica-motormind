import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from './diagnose.js';

const ids = (r) => r.causes.map((c) => c.id);

describe('códigos no encontrados (regla 2)', () => {
  test('un código que no está en el manual va a notFound, no a codes', () => {
    const r = diagnose({ vehicleId: 'tiggo4-15t', codes: ['P9999'] });
    assert.deepEqual(r.codes, []);
    assert.deepEqual(r.notFound, ['P9999']);
    assert.deepEqual(r.causes, []);
  });

  test('mezcla de encontrados y no encontrados', () => {
    const r = diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0301', 'P9999'] });
    assert.deepEqual(r.codes.map((c) => c.code), ['P0301']);
    assert.deepEqual(r.notFound, ['P9999']);
    assert.deepEqual(ids(r), ['bobina-cil1', 'bujias', 'inyector-cil1']);
  });

  test('un código que existe en otro vehículo pero no en este es notFound', () => {
    // P0171 está en el Golf, no en el Tiggo
    const r = diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0171'] });
    assert.deepEqual(r.notFound, ['P0171']);
    assert.deepEqual(r.causes, []);
  });

  test('notFound devuelve el código normalizado', () => {
    const r = diagnose({ vehicleId: 'tiggo4-15t', codes: [' p9999 '] });
    assert.deepEqual(r.notFound, ['P9999']);
  });
});

describe('normalización de códigos', () => {
  test('acepta minúsculas y espacios en lo que ingresa el mecánico', () => {
    const r = diagnose({ vehicleId: 'tiggo4-15t', codes: [' p0301 '] });
    assert.deepEqual(r.codes, [{ code: 'P0301', description: 'Fallo de encendido en el cilindro 1' }]);
    assert.deepEqual(r.notFound, []);
    assert.deepEqual(ids(r), ['bobina-cil1', 'bujias', 'inyector-cil1']);
  });

  test('encuentra un código cuya clave en el manual tiene espacios ("P0420 " en el Golf)', () => {
    const r = diagnose({ vehicleId: 'golf7-14tsi', codes: ['P0420'] });
    assert.deepEqual(r.codes, [
      { code: 'P0420', description: 'Eficiencia del catalizador por debajo del umbral (banco 1)' },
    ]);
    assert.deepEqual(r.notFound, []);
    assert.deepEqual(ids(r), ['catalizador', 'sonda-posterior']);
  });

  test('códigos repetidos cuentan una sola vez', () => {
    const r = diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0301', 'p0301', ' P0301'] });
    assert.deepEqual(r.codes.map((c) => c.code), ['P0301']);
    assert.deepEqual(r, diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0301'] }));
  });
});

describe('vehículo (regla 3)', () => {
  test('las causas salen del vehículo pedido, no de otro con el mismo id de causa', () => {
    const r = diagnose({ vehicleId: 'golf7-14tsi', codes: ['P0171'] });
    const tomaAire = r.causes.find((c) => c.id === 'toma-aire');
    assert.equal(r.vehicle, 'Volkswagen Golf VII 1.4 TSI');
    assert.equal(tomaAire.title, 'Fuga de vacío en el tubo de la válvula PCV');
    assert.equal(tomaAire.component, 'Ventilación del cárter');
  });

  test('un vehículo inexistente lanza un error que nombra el id', () => {
    assert.throws(() => diagnose({ vehicleId: 'no-existe', codes: ['P0300'] }), /no-existe/);
  });

  test('vehicleId ausente es un error', () => {
    assert.throws(() => diagnose({ codes: ['P0300'] }), TypeError);
    assert.throws(() => diagnose({ vehicleId: '', codes: ['P0300'] }), TypeError);
    assert.throws(() => diagnose({ vehicleId: '   ', codes: ['P0300'] }), TypeError);
  });
});

describe('orden de las causas (regla 1) y determinismo (regla 4)', () => {
  test('el resultado no depende del orden de los códigos', () => {
    const a = diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0300', 'P0301', 'P9999', 'P0001'] });
    const b = diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0001', 'P0301', 'P9999', 'P0300'] });
    assert.deepEqual(a, b);
  });

  test('codes y notFound salen ordenados alfabéticamente', () => {
    const r = diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0301', 'P9999', 'P0300', 'P0001'] });
    assert.deepEqual(r.codes.map((c) => c.code), ['P0300', 'P0301']);
    assert.deepEqual(r.notFound, ['P0001', 'P9999']);
  });

  test('a igual probabilidad se desempata por id', () => {
    // inyector-cil1 (P0301) y toma-aire (P0300) quedan las dos en 0.25
    const r = diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0300', 'P0301'] });
    assert.deepEqual(ids(r), ['bujias', 'bobina-cil1', 'inyector-cil1', 'toma-aire', 'presion-combustible']);
  });

  test('las probabilidades quedan de mayor a menor y entre 0 y 1', () => {
    const r = diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0300', 'P0301', 'P0420'] });
    const ps = r.causes.map((c) => c.probability);
    assert.deepEqual(ps, [...ps].sort((x, y) => y - x));
    for (const p of ps) assert.ok(p >= 0 && p <= 1, `probabilidad fuera de rango: ${p}`);
  });
});

describe('causa compartida entre códigos (regla 5: noisy-OR)', () => {
  test('aparece una sola vez, con los dos códigos y probabilidad 1 − (1−0.4)(1−0.3) = 0.58', () => {
    const r = diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0301', 'P0300'] });
    const bujias = r.causes.filter((c) => c.id === 'bujias');
    assert.equal(bujias.length, 1);
    assert.deepEqual(bujias[0].codes, ['P0300', 'P0301']);
    assert.equal(bujias[0].probability, 0.58);
    assert.equal(r.causes[0].id, 'bujias');
  });

  test('una causa de un solo código conserva la probabilidad del manual', () => {
    const r = diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0300', 'P0301'] });
    assert.equal(r.causes.find((c) => c.id === 'bobina-cil1').probability, 0.45);
    assert.equal(r.causes.find((c) => c.id === 'presion-combustible').probability, 0.2);
  });
});

describe('datos incompletos del manual', () => {
  test('una causa sin detalle en el manual (sonda-anterior del Tiggo) se excluye', () => {
    const r = diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0420'] });
    assert.deepEqual(r.codes.map((c) => c.code), ['P0420']);
    assert.deepEqual(r.notFound, []);
    assert.deepEqual(ids(r), ['catalizador', 'sonda-posterior']);
  });
});

describe('entradas límite', () => {
  test('sin códigos devuelve un resultado vacío, no un error', () => {
    const r = diagnose({ vehicleId: 'clio4-15dci', codes: [] });
    assert.deepEqual(r, { vehicle: 'Renault Clio IV 1.5 dCi', codes: [], notFound: [], causes: [] });
  });

  test('codes que no es un array es un error', () => {
    assert.throws(() => diagnose({ vehicleId: 'tiggo4-15t', codes: 'P0300' }), TypeError);
    assert.throws(() => diagnose({ vehicleId: 'tiggo4-15t' }), TypeError);
  });

  test('un código que no es string es un error', () => {
    assert.throws(() => diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0300', null] }), TypeError);
    assert.throws(() => diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0300', '  '] }), TypeError);
  });

  test('modificar el resultado no altera el manual para la próxima llamada', () => {
    const r1 = diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0301'] });
    r1.causes[0].steps[0].text = 'MUTADO';
    r1.causes[0].steps.push({ text: 'x', expected: 'y' });
    const r2 = diagnose({ vehicleId: 'tiggo4-15t', codes: ['P0301'] });
    assert.notEqual(r2.causes[0].steps[0].text, 'MUTADO');
    assert.equal(r2.causes[0].steps.length, 2);
  });
});
