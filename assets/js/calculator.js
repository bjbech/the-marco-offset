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

    // Works out which of "." and "," is the decimal point, given that people
    // paste both en-US ("1,579.55") and European ("1.579,55") formats.
    function decimalSeparatorOf(text) {
        const lastComma = text.lastIndexOf(',');
        const lastDot = text.lastIndexOf('.');

        // With both present, whichever comes last is the decimal point.
        if (lastComma >= 0 && lastDot >= 0) {
            return lastComma > lastDot ? ',' : '.';
        }

        const separator = lastComma >= 0 ? ',' : (lastDot >= 0 ? '.' : '');
        if (separator === '') return '';

        const parts = text.split(separator);
        // A decimal point appears once; repeats are digit grouping (1,234,567).
        if (parts.length > 2) return '';
        // Three trailing digits is grouping ("1,579"), except after a bare zero,
        // where "0,500" can only be a fraction.
        if (parts[1].length === 3 && parts[0] !== '0' && parts[0] !== '') return '';
        return separator;
    }

    // Returns NaN for text that is not a number at all, so the page can tell
    // "nothing entered" apart from "that isn't a number" and say so.
    function parseAmount(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
        if (value === null || value === undefined) return NaN;

        // A currency marker may lead or trail ("C$1,579", "1579 EUR"), and
        // grouping spaces sit between digits; a letter among the digits is a
        // typo rather than a currency marker.
        const text = String(value).trim()
            .replace(/^[^\d.,-]+/, '')
            .replace(/[^\d.,]+$/, '')
            .replace(/[\s ]/g, '');

        if (!/\d/.test(text) || /[^\d.,-]/.test(text)) return NaN;

        const negative = text.startsWith('-');
        const digits = text.replace(/-/g, '');
        const separator = decimalSeparatorOf(digits);

        let normalized;
        if (separator === '') {
            normalized = digits.replace(/[.,]/g, '');
        } else {
            const grouping = separator === ',' ? '.' : ',';
            normalized = digits.split(grouping).join('').replace(separator, '.');
        }

        const parsed = Number(normalized);
        if (!Number.isFinite(parsed)) return NaN;
        return negative ? -parsed : parsed;
    }

    // Every input is money someone spent. A blank field, unreadable text or a
    // typed-in negative all mean "nothing" — never a discount off the donation.
    function amount(value) {
        const parsed = parseAmount(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    // A missing or nonsensical rate must not pass as 1: that reports a local
    // amount as though it were USD, overstating a Canadian donation by about
    // 39%. null makes the page say so instead of showing a wrong number.
    function usableRate(value) {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

        const conversionRate = usableRate(input.conversionRate);

        return {
            baseOffset: baseOffset,
            aiCost: aiCost,
            offsetLocal: offsetLocal,
            offsetUSD: conversionRate === null ? null : offsetLocal * conversionRate
        };
    }

    // Tiltify's donate page prefills its amount field from an `amount` query
    // parameter (undocumented, but confirmed working). A zero offset is left
    // off entirely rather than handing someone a prefilled 0.00.
    function donationUrl(baseUrl, offsetUSD) {
        const donation = amount(offsetUSD);
        return donation > 0 ? baseUrl + '?amount=' + donation.toFixed(2) : baseUrl;
    }

    // Frankfurter quotes the base against each target ("1 USD = 1.3887 CAD");
    // conversionRate.json stores the inverse, local -> USD, keyed by the
    // country names in devices.json.
    const RATES_ENDPOINT = 'https://api.frankfurter.dev/v2/rates';
    const RATES_BASE = 'USD';
    const RATES_PROVIDER = 'ECB';

    // Deriving the quote currencies from the device data means a new country
    // only ever has to be added to devices.json.
    function ratesUrl(devices) {
        const quotes = [];

        Object.keys(devices).forEach(function (country) {
            const code = devices[country].currency;
            if (code && quotes.indexOf(code) === -1) quotes.push(code);
        });

        return RATES_ENDPOINT +
            '?base=' + RATES_BASE +
            '&quotes=' + quotes.join(',') +
            '&providers=' + RATES_PROVIDER;
    }

    // Returns null rather than a partial object: one missing currency would
    // reach the offset arithmetic as undefined and blank out that country.
    function ratesByCountry(payload, devices) {
        if (!Array.isArray(payload) || payload.length === 0) return null;

        const quoted = {};

        for (const entry of payload) {
            if (!entry || entry.base !== RATES_BASE) return null;
            if (typeof entry.quote !== 'string') return null;
            if (!Number.isFinite(entry.rate) || entry.rate <= 0) return null;
            quoted[entry.quote] = entry.rate;
        }

        // The base is worth 1 of itself whether or not the response says so.
        quoted[RATES_BASE] = 1;

        const rates = {};

        for (const country of Object.keys(devices)) {
            const quote = quoted[devices[country].currency];
            if (!Number.isFinite(quote) || quote <= 0) return null;
            // Significant figures, not decimal places: six decimals is exact
            // enough near 1.0 but loses 0.8% on a currency like IDR, where a
            // unit is worth about 0.0000625 USD.
            rates[country] = Number((1 / quote).toPrecision(8));
        }

        if (Object.keys(rates).length === 0) return null;

        return rates;
    }

    return {
        MONTHS_PER_YEAR: MONTHS_PER_YEAR,
        donationUrl: donationUrl,
        parseAmount: parseAmount,
        amount: amount,
        sumBasePrices: sumBasePrices,
        annualFromMonthly: annualFromMonthly,
        computeOffset: computeOffset,
        ratesUrl: ratesUrl,
        ratesByCountry: ratesByCountry
    };
});
