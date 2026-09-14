const test = require('node:test');
const assert = require('node:assert/strict');

const { ratesUrl, ratesByCountry } = require('../assets/js/calculator.js');

// Shaped like data/devices.json, trimmed to the fields these functions read.
const DEVICES = {
    USA: { currency: 'USD', symbol: '$', devices: {} },
    Canada: { currency: 'CAD', symbol: 'C$', devices: {} },
    'United Kingdom': { currency: 'GBP', symbol: '£', devices: {} },
    Italy: { currency: 'EUR', symbol: '€', devices: {} }
};

// A real Frankfurter v2 response for 2026-09-14, pinned to ECB.
function payload() {
    return [
        { date: '2026-09-14', base: 'USD', quote: 'CAD', rate: 1.3887 },
        { date: '2026-09-14', base: 'USD', quote: 'EUR', rate: 0.86573 },
        { date: '2026-09-14', base: 'USD', quote: 'GBP', rate: 0.74104 }
    ];
}

test('ratesUrl asks for every currency the device data uses', () => {
    const url = ratesUrl(DEVICES);
    const params = new URL(url).searchParams;

    assert.ok(url.startsWith('https://api.frankfurter.dev/v2/rates?'), url);
    assert.equal(params.get('base'), 'USD');
    assert.equal(params.get('providers'), 'ECB');
    assert.deepEqual(params.get('quotes').split(',').sort(), ['CAD', 'EUR', 'GBP', 'USD']);
});

test('ratesUrl names a shared currency once', () => {
    const url = ratesUrl(Object.assign({}, DEVICES, {
        Germany: { currency: 'EUR', symbol: '€', devices: {} }
    }));

    const quotes = new URL(url).searchParams.get('quotes').split(',');
    assert.equal(quotes.filter(function (code) { return code === 'EUR'; }).length, 1);
});

test('ratesByCountry inverts USD quotes into local-to-USD rates', () => {
    assert.deepEqual(ratesByCountry(payload(), DEVICES), {
        USA: 1,
        Canada: 0.72009793,
        'United Kingdom': 1.3494548,
        Italy: 1.1550945
    });
});

// The base currency is worth 1 of itself. Frankfurter is asked for a USD quote
// and returns 1.0, but the value must not depend on that.
test('ratesByCountry reports the base currency as exactly 1', () => {
    const withUsd = payload().concat({ date: '2026-09-14', base: 'USD', quote: 'USD', rate: 1.0 });

    assert.equal(ratesByCountry(payload(), DEVICES).USA, 1);
    assert.equal(ratesByCountry(withUsd, DEVICES).USA, 1);
});

// A partial object would leave the missing country with an undefined rate and
// blank out that visitor's donation figure, so the whole payload is refused.
test('ratesByCountry returns null when a country currency is not quoted', () => {
    const missingGbp = payload().filter(function (entry) { return entry.quote !== 'GBP'; });

    assert.equal(ratesByCountry(missingGbp, DEVICES), null);
});

test('ratesByCountry returns null for a rate that is not a usable number', () => {
    for (const bad of [0, -1.3887, ' 1.3887', null, undefined, NaN, Infinity]) {
        const broken = payload();
        broken[0].rate = bad;

        assert.equal(
            ratesByCountry(broken, DEVICES),
            null,
            `rate ${JSON.stringify(bad)} should be refused`
        );
    }
});

test('ratesByCountry returns null for a payload that is empty or not an array', () => {
    for (const bad of [[], null, undefined, {}, 'nope']) {
        assert.equal(ratesByCountry(bad, DEVICES), null, `${JSON.stringify(bad)} should be refused`);
    }
});

test('ratesByCountry refuses a payload quoted against a different base', () => {
    const eurBase = [{ date: '2026-09-14', base: 'EUR', quote: 'CAD', rate: 1.6 }];

    assert.equal(ratesByCountry(eurBase, DEVICES), null);
});

test('ratesByCountry rounds to eight significant figures', () => {
    const rates = ratesByCountry(payload(), DEVICES);

    for (const value of Object.values(rates)) {
        assert.equal(value, Number(value.toPrecision(8)), `${value} carries more than 8 sig figs`);
    }
});

// Rounding to a fixed number of decimal places would cost 0.8% here, which is
// more than a month of exchange-rate drift. IDR is worth ~0.0000625 USD.
test('ratesByCountry keeps precision on a low-value currency', () => {
    const devices = Object.assign({}, DEVICES, {
        Indonesia: { currency: 'IDR', symbol: 'Rp', devices: {} }
    });
    const withIdr = payload().concat({
        date: '2026-09-14', base: 'USD', quote: 'IDR', rate: 16000
    });

    assert.equal(ratesByCountry(withIdr, devices).Indonesia, 0.0000625);
});
