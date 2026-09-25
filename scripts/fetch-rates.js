// Refreshes data/conversionRate.json from Frankfurter before each Netlify
// build. A failed fetch is deliberately not a build failure: the committed
// rates are only ever a little stale, and shipping them beats failing a deploy
// over someone else's downtime. `node --test` runs afterwards, so a file that
// did get written but is malformed still stops the deploy.

const fs = require('node:fs');
const path = require('node:path');

const { ratesUrl, ratesByCountry } = require('../assets/js/calculator.js');

// Long enough for a cold Cloudflare cache, short enough not to stall a build.
const TIMEOUT_MS = 10000;

const dataDir = path.join(__dirname, '..', 'data');
const devicesPath = path.join(dataDir, 'devices.json');
const ratesPath = path.join(dataDir, 'conversionRate.json');

async function main() {
    const devices = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));

    const response = await fetch(ratesUrl(devices), {
        signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    if (!response.ok) {
        throw new Error('Frankfurter returned HTTP ' + response.status);
    }

    const rates = ratesByCountry(await response.json(), devices);

    if (rates === null) {
        throw new Error('the response did not cover every country in devices.json');
    }

    fs.writeFileSync(ratesPath, JSON.stringify(rates, null, 2) + '\n');
    console.log('Conversion rates updated: ' + JSON.stringify(rates));
}

main().catch(function (error) {
    console.warn('Keeping the committed conversion rates: ' + error.message);
});
