let deviceData = {};
let conversionRates = {};
let currentCountry = 'USA';
let currentLevel = 1;

// The annual AI field tracks monthly x 12 until the visitor types their own
// figure, which covers subscriptions plus metered usage, annual plans, and
// anyone who started partway through the year.
let annualAiOverridden = false;

// Results refresh on input only after the button has produced one, so the page
// stays quiet until the visitor asks for a number.
let hasCalculated = false;

async function loadData() {
    try {
        const [deviceResponse, conversionResponse] = await Promise.all([
            fetch('data/devices.json'),
            fetch('data/conversionRate.json')
        ]);
        
        deviceData = await deviceResponse.json();
        conversionRates = await conversionResponse.json();
        
        initializeTable();
        updateCurrency();

        // Deliberately not awaited: the committed rates are already on screen,
        // and the page must not wait on a third party to become usable.
        refreshLiveRates();
    } catch (error) {
        console.error('Error loading data:', error);
        showDataError();
    }
}

// The committed rates are refreshed on every deploy, but a deploy can sit for
// weeks between pushes, so the page asks Frankfurter for today's fixing too.
// Every failure path here is a no-op: offline, blocked, rate-limited or slow
// all leave data/conversionRate.json standing, which is never more than about
// a percent off.
const LIVE_RATES_TIMEOUT_MS = 5000;

async function refreshLiveRates() {
    try {
        const response = await fetch(MarcoOffset.ratesUrl(deviceData), {
            signal: AbortSignal.timeout(LIVE_RATES_TIMEOUT_MS)
        });
        if (!response.ok) return;

        const live = MarcoOffset.ratesByCountry(await response.json(), deviceData);
        if (live === null) return;

        conversionRates = live;
        // Only redraws if the visitor has already calculated once.
        refreshResult();
    } catch (error) {
        // Nothing to do, and nothing worth saying: the committed rates stand.
    }
}

// An empty device table looks like a broken page with no explanation, so say
// what failed. Opening index.html straight from disk is the usual cause:
// browsers block fetch() of local files from a file:// origin.
function showDataError() {
    const servedFromDisk = window.location.protocol === 'file:';
    const advice = servedFromDisk
        ? 'This page is open from a <code>file://</code> URL, which blocks it from reading <code>data/devices.json</code>. Serve the folder over HTTP instead &mdash; for example <code>python3 -m http.server</code> &mdash; and open <code>http://localhost:8000</code>.'
        : 'Check your connection and reload the page.';

    document.getElementById('deviceTableBody').innerHTML =
        `<tr><td colspan="4">Could not load the device list. ${advice}</td></tr>`;
}

function currentDevices() {
    const countryData = deviceData[currentCountry];
    return countryData ? countryData.devices : {};
}

function inputIdFor(deviceName) {
    return deviceName.replace(/\s+/g, '_');
}

function readQuantities() {
    const quantities = {};
    Object.keys(currentDevices()).forEach(function (deviceName) {
        const field = document.getElementById(inputIdFor(deviceName));
        quantities[deviceName] = field ? field.value : 0;
    });
    return quantities;
}

function initializeTable() {
    const tableBody = document.getElementById('deviceTableBody');
    const countryData = deviceData[currentCountry];
    
    if (!countryData) return;
    
    tableBody.innerHTML = '';
    
    Object.entries(countryData.devices).forEach(([deviceName, price]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${deviceName}</td>
            <td class="device-price">${countryData.symbol}${price.toFixed(2)}</td>
            <td><input type="number" class="quantity-input" id="${inputIdFor(deviceName)}" min="0" value="0" onchange="updateTotals()"></td>
            <td class="device-total">${countryData.symbol}<span id="${inputIdFor(deviceName)}_total">0.00</span></td>
        `;
        tableBody.appendChild(row);
    });
}

function updateCurrency() {
    const countryData = deviceData[currentCountry];
    if (!countryData) return;
    
    document.querySelectorAll('.currency-symbol').forEach(function (element) {
        element.textContent = countryData.symbol;
    });
}

function updateTotals() {
    const devices = currentDevices();
    const quantities = readQuantities();
    
    Object.entries(devices).forEach(function ([deviceName, price]) {
        const subtotalElement = document.getElementById(`${inputIdFor(deviceName)}_total`);
        if (subtotalElement) {
            const subtotal = MarcoOffset.sumBasePrices({ [deviceName]: price }, quantities);
            subtotalElement.textContent = subtotal.toFixed(2);
        }
    });
    
    document.getElementById('totalBasePrice').textContent =
        MarcoOffset.sumBasePrices(devices, quantities).toFixed(2);
    
    refreshResult();
}

// Level 1 asks for no AI spend at all; level 2 asks only for the month, so the
// annual field never appears alongside it.
function updateLevelFields() {
    document.getElementById('monthlyAiGroup').hidden = currentLevel === 1;
    document.getElementById('annualAiGroup').hidden = currentLevel !== 3;
}

function syncAnnualAi() {
    if (annualAiOverridden) return;
    
    const monthly = document.getElementById('monthlyAiCost').value;
    document.getElementById('annualAiCost').value =
        monthly === '' ? '' : MarcoOffset.annualFromMonthly(monthly).toFixed(2);
}

function refreshResult() {
    if (hasCalculated) calculateOffset();
}

const CURRENCY_FIELDS = ['purchaseTotal', 'monthlyAppleCare', 'monthlyAiCost', 'annualAiCost'];

// Text already written as a plain number is left exactly as typed, so "240.00"
// does not get rewritten to "240" under someone's cursor.
const PLAIN_NUMBER = /^-?\d*\.?\d*$/;

function setFieldError(field, message) {
    const error = document.getElementById(`${field.id}Error`);
    if (error) {
        error.textContent = message;
        error.hidden = !message;
    }

    if (message) {
        field.setAttribute('aria-invalid', 'true');
    } else {
        field.removeAttribute('aria-invalid');
    }
}

// Rewrites a pasted value to the number the calculator actually read, so a
// misinterpreted separator is visible before anyone donates on the strength
// of it. Text that is not a number at all says so instead of counting as 0.
function normalizeField(field) {
    const raw = field.value.trim();

    if (raw === '' || PLAIN_NUMBER.test(raw)) {
        setFieldError(field, '');
        return;
    }

    const parsed = MarcoOffset.parseAmount(raw);
    if (Number.isNaN(parsed)) {
        setFieldError(field, `"${raw}" is not a number the calculator can read.`);
        return;
    }

    field.value = String(parsed);
    setFieldError(field, '');
    refreshResult();
}

function calculateOffset() {
    const countryData = deviceData[currentCountry];
    if (!countryData) return;
    
    const result = MarcoOffset.computeOffset({
        level: currentLevel,
        totalBase: MarcoOffset.sumBasePrices(countryData.devices, readQuantities()),
        purchaseTotal: document.getElementById('purchaseTotal').value,
        monthlyAppleCare: document.getElementById('monthlyAppleCare').value,
        monthlyAiCost: document.getElementById('monthlyAiCost').value,
        annualAiCost: document.getElementById('annualAiCost').value,
        conversionRate: conversionRates[currentCountry]
    });
    
    const formatter = new Intl.NumberFormat('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    });
    
    // Update display
    document.getElementById('offsetLevelLabel').textContent = ` (Level ${currentLevel})`;

    const localCurrencyDisplay = document.getElementById('localCurrencyDisplay');
    localCurrencyDisplay.style.fontWeight = 'normal';

    // No usable rate means no honest USD figure. Showing the local amount and
    // saying why beats printing it with a dollar sign in front of it.
    if (result.offsetUSD === null) {
        document.getElementById('offsetAmountUSD').textContent = '—';
        localCurrencyDisplay.textContent =
            `(${countryData.symbol}${formatter.format(result.offsetLocal)} — no conversion rate available)`;
    } else {
        document.getElementById('offsetAmountUSD').textContent = formatter.format(result.offsetUSD);
        // The local figure is only worth repeating when it differs from the USD one.
        localCurrencyDisplay.textContent = currentCountry === 'USA'
            ? ''
            : `(${countryData.symbol}${formatter.format(result.offsetLocal)})`;
    }
    
    // Update donation link with USD value
    const baseUrl = "https://donate.tiltify.com/@bbech/the-marco-offset";
    document.getElementById("donationLink").href = MarcoOffset.donationUrl(baseUrl, result.offsetUSD);
    
    hasCalculated = true;
}

document.addEventListener('DOMContentLoaded', function() {
    // Browsers restore form values on refresh, so read the controls rather than
    // assuming they still sit at their default options.
    currentCountry = document.getElementById('country').value;
    currentLevel = Number(document.getElementById('offsetLevel').value);

    document.getElementById('country').addEventListener('change', function() {
        currentCountry = this.value;
        initializeTable();
        updateCurrency();
        updateTotals();
    });
    
    document.getElementById('offsetLevel').addEventListener('change', function() {
        currentLevel = Number(this.value);
        updateLevelFields();
        refreshResult();
    });
    
    document.getElementById('monthlyAiCost').addEventListener('input', function() {
        syncAnnualAi();
        refreshResult();
    });
    
    // Clearing the annual field hands control back to the monthly extrapolation.
    document.getElementById('annualAiCost').addEventListener('input', function() {
        annualAiOverridden = this.value !== '';
        if (!annualAiOverridden) syncAnnualAi();
        refreshResult();
    });
    
    document.getElementById('purchaseTotal').addEventListener('input', refreshResult);
    document.getElementById('monthlyAppleCare').addEventListener('input', refreshResult);

    // Normalize on the way out rather than mid-keystroke, and drop a stale
    // error as soon as someone starts correcting the field.
    CURRENCY_FIELDS.forEach(function (id) {
        const field = document.getElementById(id);
        field.addEventListener('blur', function () { normalizeField(this); });
        field.addEventListener('input', function () { setFieldError(this, ''); });
    });
    
    updateLevelFields();
    loadData();
});
