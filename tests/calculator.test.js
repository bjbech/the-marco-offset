const test = require('node:test');
const assert = require('node:assert/strict');

const {
    sumBasePrices,
    annualFromMonthly,
    donationUrl,
    computeOffset
} = require('../assets/js/calculator.js');

const devices = {
    'iPhone Air': 999,
    'iPhone 17': 799,
    'AirPods Pro 3': 249
};

// Baseline inputs: one iPhone Air at base, $1200 spent, no AppleCare, no AI.
function inputs(overrides) {
    return Object.assign({
        level: 1,
        totalBase: 999,
        purchaseTotal: 1200,
        monthlyAppleCare: 0,
        monthlyAiCost: 0,
        annualAiCost: 0,
        conversionRate: 1
    }, overrides);
}

test('sumBasePrices multiplies each device price by its quantity', () => {
    assert.equal(sumBasePrices(devices, { 'iPhone Air': 2, 'AirPods Pro 3': 1 }), 2247);
});

test('sumBasePrices treats missing, blank and negative quantities as zero', () => {
    assert.equal(sumBasePrices(devices, {}), 0);
    assert.equal(sumBasePrices(devices, { 'iPhone Air': '', 'iPhone 17': 'abc' }), 0);
    assert.equal(sumBasePrices(devices, { 'iPhone Air': -3 }), 0);
});

test('annualFromMonthly extrapolates twelve months', () => {
    assert.equal(annualFromMonthly(20), 240);
    assert.equal(annualFromMonthly(''), 0);
    assert.equal(annualFromMonthly(-20), 0);
});

test('level 1 returns the delta above base price', () => {
    const result = computeOffset(inputs());
    assert.equal(result.baseOffset, 201);
    assert.equal(result.aiCost, 0);
    assert.equal(result.offsetLocal, 201);
    assert.equal(result.offsetUSD, 201);
});

test('level 1 clamps a purchase below base price to zero', () => {
    assert.equal(computeOffset(inputs({ purchaseTotal: 900 })).offsetLocal, 0);
});

test('AppleCare is charged as twelve monthly payments', () => {
    // 1200 + (9.99 * 12) - 999
    assert.equal(computeOffset(inputs({ monthlyAppleCare: 9.99 })).baseOffset.toFixed(2), '320.88');
});

test('level 2 adds the monthly AI cost', () => {
    const result = computeOffset(inputs({ level: 2, monthlyAiCost: 20, annualAiCost: 240 }));
    assert.equal(result.aiCost, 20);
    assert.equal(result.offsetLocal, 221);
});

test('level 2 still yields the AI cost when the device delta is negative', () => {
    const result = computeOffset(inputs({ level: 2, purchaseTotal: 900, monthlyAiCost: 20 }));
    assert.equal(result.baseOffset, 0);
    assert.equal(result.offsetLocal, 20);
});

test('level 3 uses the annual AI cost, not the monthly one', () => {
    const result = computeOffset(inputs({ level: 3, monthlyAiCost: 20, annualAiCost: 240 }));
    assert.equal(result.aiCost, 240);
    assert.equal(result.offsetLocal, 441);
});

test('level 3 honors an annual override that is not twelve times monthly', () => {
    const result = computeOffset(inputs({ level: 3, monthlyAiCost: 20, annualAiCost: 200 }));
    assert.equal(result.aiCost, 200);
    assert.equal(result.offsetLocal, 401);
});

test('level 1 ignores AI costs entirely', () => {
    const result = computeOffset(inputs({ level: 1, monthlyAiCost: 20, annualAiCost: 240 }));
    assert.equal(result.aiCost, 0);
    assert.equal(result.offsetLocal, 201);
});

test('converts the local offset to USD at the country rate', () => {
    // United Kingdom: 1.36, Canada: 0.72
    assert.equal(computeOffset(inputs({ conversionRate: 1.36 })).offsetUSD.toFixed(2), '273.36');
    assert.equal(computeOffset(inputs({ conversionRate: 0.72 })).offsetUSD.toFixed(2), '144.72');
});

test('conversion applies to the AI portion as well', () => {
    const result = computeOffset(inputs({ level: 2, monthlyAiCost: 20, conversionRate: 1.36 }));
    assert.equal(result.offsetLocal, 221);
    assert.equal(result.offsetUSD.toFixed(2), '300.56');
});

test('blank and non-numeric inputs read as zero', () => {
    const result = computeOffset({
        level: 2,
        totalBase: '',
        purchaseTotal: '1200',
        monthlyAppleCare: undefined,
        monthlyAiCost: 'twenty',
        annualAiCost: null,
        conversionRate: 1
    });
    assert.equal(result.aiCost, 0);
    assert.equal(result.offsetLocal, 1200);
});

test('negative entries are clamped to zero rather than reducing the donation', () => {
    assert.equal(computeOffset(inputs({ level: 2, monthlyAiCost: -50 })).aiCost, 0);
    assert.equal(computeOffset(inputs({ level: 3, annualAiCost: -600 })).aiCost, 0);
    assert.equal(computeOffset(inputs({ purchaseTotal: -1200 })).offsetLocal, 0);
    assert.equal(computeOffset(inputs({ monthlyAppleCare: -10 })).baseOffset, 201);
});

test('an unrecognized level falls back to the base offset', () => {
    assert.equal(computeOffset(inputs({ level: 99, monthlyAiCost: 20 })).aiCost, 0);
});

const DONATE_URL = 'https://donate.tiltify.com/@bbech/the-marco-offset';

test('donationUrl appends the offset as an amount parameter', () => {
    assert.equal(donationUrl(DONATE_URL, 321), `${DONATE_URL}?amount=321.00`);
    assert.equal(donationUrl(DONATE_URL, 237.5), `${DONATE_URL}?amount=237.50`);
    assert.equal(donationUrl(DONATE_URL, 1234.567), `${DONATE_URL}?amount=1234.57`);
});

test('donationUrl omits the parameter when there is nothing to donate', () => {
    // Prefilling 0.00 would be worse than leaving the field for them to fill.
    assert.equal(donationUrl(DONATE_URL, 0), DONATE_URL);
    assert.equal(donationUrl(DONATE_URL, -50), DONATE_URL);
    assert.equal(donationUrl(DONATE_URL, ''), DONATE_URL);
    assert.equal(donationUrl(DONATE_URL, undefined), DONATE_URL);
});

test('donationUrl matches what computeOffset produces end to end', () => {
    const result = computeOffset(inputs({ level: 2, monthlyAiCost: 20 }));
    assert.equal(donationUrl(DONATE_URL, result.offsetUSD), `${DONATE_URL}?amount=221.00`);
});

// Returning 1 here would report a local amount as though it were USD: a
// Canadian would be told to donate C$500 as "$500", about 39% too much.
test('an unusable rate yields no USD figure rather than a wrong one', () => {
    for (const bad of [undefined, null, '', 'abc', 0, -1.36, NaN]) {
        const result = computeOffset(inputs({ conversionRate: bad }));

        assert.equal(result.offsetUSD, null, `rate ${JSON.stringify(bad)} should not convert`);
        // The local figure is still correct, and the page still shows it.
        assert.equal(result.offsetLocal, 201);
    }
});

test('a rate of 1 still converts, because that is the USA rate', () => {
    assert.equal(computeOffset(inputs({ conversionRate: 1 })).offsetUSD, 201);
});

test('an unconverted offset leaves the donate link without a prefilled amount', () => {
    const result = computeOffset(inputs({ conversionRate: undefined }));

    assert.equal(donationUrl(DONATE_URL, result.offsetUSD), DONATE_URL);
});
