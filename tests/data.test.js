const test = require('node:test');
const assert = require('node:assert/strict');

const devices = require('../data/devices.json');

// USA is maintained first each September; the other countries follow its lineup.
const REFERENCE = 'USA';
const countries = Object.keys(devices);

test('every country lists the same devices as the USA lineup', () => {
    const expected = Object.keys(devices[REFERENCE].devices).sort();

    for (const country of countries) {
        assert.deepEqual(
            Object.keys(devices[country].devices).sort(),
            expected,
            `${country} does not match the ${REFERENCE} device list`
        );
    }
});

// A zero base price would make a buyer's entire purchase count as the offset,
// so placeholders must not reach a deploy.
test('every device has a base price greater than zero', () => {
    const missing = [];

    for (const country of countries) {
        for (const [name, price] of Object.entries(devices[country].devices)) {
            if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
                missing.push(`${country} / ${name} = ${JSON.stringify(price)}`);
            }
        }
    }

    assert.deepEqual(missing, [], `prices still to be filled in:\n  ${missing.join('\n  ')}\n`);
});

test('every country declares a currency and a symbol', () => {
    for (const country of countries) {
        assert.ok(devices[country].currency, `${country} is missing currency`);
        assert.ok(devices[country].symbol, `${country} is missing symbol`);
    }
});

const conversionRates = require('../data/conversionRate.json');

// computeOffset() falls back to a rate of 1 when one is missing, which would
// silently report a local amount as though it were USD.
test('every country has a conversion rate', () => {
    for (const country of countries) {
        assert.ok(
            Object.prototype.hasOwnProperty.call(conversionRates, country),
            `${country} has no entry in conversionRate.json`
        );
    }
});

test('conversion rates are positive numbers, with USD as the baseline', () => {
    for (const [country, rate] of Object.entries(conversionRates)) {
        assert.ok(Number.isFinite(rate) && rate > 0, `${country} rate is not a positive number: ${rate}`);
    }
    // Rates convert local currency to USD, so the USA entry is 1 by definition.
    assert.equal(conversionRates.USA, 1.0);
});
