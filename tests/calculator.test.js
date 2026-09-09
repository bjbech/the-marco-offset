const test = require('node:test');
const assert = require('node:assert/strict');

const {
    sumBasePrices,
    annualFromMonthly,
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
