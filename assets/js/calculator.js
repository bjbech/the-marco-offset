// Pure offset arithmetic, with no DOM access, so the browser and the test
// runner can both load it: a plain <script> tag gets globalThis.MarcoOffset,
// `node --test` gets the same object through module.exports.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.MarcoOffset = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const MONTHS_PER_YEAR = 12;

    // Every input is money someone spent. A blank field, a stray letter or a
    // typed-in negative all mean "nothing" — never a discount off the donation.
    function amount(value) {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    // A missing or nonsensical rate leaves the figure in local currency rather
    // than zeroing the donation, which is what amount() would do here.
    function rate(value) {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }

    function sumBasePrices(devices, quantities) {
        return Object.entries(devices).reduce(function (total, entry) {
            const deviceName = entry[0];
            const price = entry[1];
            return total + amount(quantities[deviceName]) * amount(price);
        }, 0);
    }

    function annualFromMonthly(monthly) {
        return amount(monthly) * MONTHS_PER_YEAR;
    }

    // Level 1 is the base offset alone; 2 adds this month's AI spend, 3 adds
    // the year's. Anything unrecognized falls back to the base offset.
    function aiCostForLevel(level, monthlyAiCost, annualAiCost) {
        if (Number(level) === 2) return amount(monthlyAiCost);
        if (Number(level) === 3) return amount(annualAiCost);
        return 0;
    }

    function computeOffset(input) {
        const totalSpent = amount(input.purchaseTotal) +
            amount(input.monthlyAppleCare) * MONTHS_PER_YEAR;

        // Floored at zero: buying at or under base price contributes nothing,
        // and must not eat into the AI cost added on top of it.
        const baseOffset = Math.max(0, totalSpent - amount(input.totalBase));
        const aiCost = aiCostForLevel(input.level, input.monthlyAiCost, input.annualAiCost);
        const offsetLocal = baseOffset + aiCost;

        return {
            baseOffset: baseOffset,
            aiCost: aiCost,
            offsetLocal: offsetLocal,
            offsetUSD: offsetLocal * rate(input.conversionRate)
        };
    }

    return {
        MONTHS_PER_YEAR: MONTHS_PER_YEAR,
        sumBasePrices: sumBasePrices,
        annualFromMonthly: annualFromMonthly,
        computeOffset: computeOffset
    };
});
