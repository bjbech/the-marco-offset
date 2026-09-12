const test = require('node:test');
const assert = require('node:assert/strict');

const { parseAmount, amount } = require('../assets/js/calculator.js');

// Each row is [input, expected]. NaN means "not a number at all", which the
// page reports as an error rather than silently treating as zero.
const cases = [
    // Plain values
    ['1579', 1579],
    ['1579.55', 1579.55],
    ['0', 0],
    [1579.55, 1579.55],

    // Both separators present: the last one is the decimal separator.
    ['1,579.55', 1579.55],     // en-US, the format from the issue report
    ['1.579,55', 1579.55],     // it-IT / de-DE
    ['1,234,567.89', 1234567.89],
    ['1.234.567,89', 1234567.89],

    // A single separator followed by exactly three digits is grouping...
    ['1,579', 1579],
    ['1.579', 1579],
    ['1,234,567', 1234567],
    ['1.234.567', 1234567],

    // ...unless the integer part is a bare zero, where it must be a decimal.
    ['0.500', 0.5],
    ['0,500', 0.5],

    // Any other digit count after a single separator is a decimal separator.
    ['1,5', 1.5],
    ['12.50', 12.5],
    ['1,5795', 1.5795],
    ['1,', 1],

    // Currency symbols, spaces and the non-breaking space spreadsheets paste.
    ['$1,579.55', 1579.55],
    ['€1.579,55', 1579.55],
    ['£1,579.55', 1579.55],
    ['1 579,55', 1579.55],
    ['1 579,55', 1579.55],
    ['  1579.55  ', 1579.55],

    // Negatives survive parsing; amount() is what clamps them.
    ['-50', -50],

    // Not numbers.
    ['', NaN],
    ['abc', NaN],
    ['1o5', NaN],
    ['$', NaN],
    [null, NaN],
    [undefined, NaN]
];

for (const [input, expected] of cases) {
    test(`parseAmount(${JSON.stringify(input)}) is ${expected}`, () => {
        const actual = parseAmount(input);
        if (Number.isNaN(expected)) {
            assert.ok(Number.isNaN(actual), `expected NaN, got ${actual}`);
        } else {
            assert.equal(actual, expected);
        }
    });
}

test('amount() clamps what parseAmount returns', () => {
    assert.equal(amount('1,579.55'), 1579.55);
    assert.equal(amount('-50'), 0);      // negatives never reduce a donation
    assert.equal(amount('abc'), 0);      // unparseable still computes as zero
    assert.equal(amount(''), 0);
});
