# Contributing

Fork the repository, create a branch, make your change, and open a pull request.
The site is static — no build tooling to install. Serve it with
`python3 -m http.server` and run the tests with `node --test`.

## Adding a country

Three files are involved, and one ordering rule: **`data/conversionRate.json` is
generated, not hand-edited.** Adding a country to `data/devices.json` makes the
committed rate file incomplete, and `node --test` will fail until you regenerate
it in step 4.

### 1. Check the currency is one the ECB publishes

Rates come from Frankfurter pinned to the European Central Bank, which publishes
47 codes — about 35 once the pre-euro legacy ones are set aside, and well short
of Frankfurter's full 205. Check before doing any other work:

```bash
curl "https://api.frankfurter.dev/v2/rates?base=USD&quotes=AUD&providers=ECB"
```

- A rate comes back → supported, carry on.
- `[]` comes back (with HTTP 200, not an error) → **the ECB does not publish that
  currency.** Stop and open an issue rather than working around it. Dropping the
  `providers=ECB` pin would widen coverage but changes every rate on the site, so
  it is a project decision, not part of adding one country.
- `HTTP 422 invalid currency` → the code is not valid ISO 4217. Check the spelling.

To see the full supported list:

```bash
curl -s "https://api.frankfurter.dev/v2/providers" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).find(p=>p.key==='ECB').currencies.join(' ')))"
```

Some codes in that list are legacy currencies that no longer circulate (`GRD`,
`SIT`, `SKK`, `CYP`, `MTL`, `EEK`, `LTL`, `LVL`, `HRK`, `ROL`, `TRL`) and are not
usable for a present-day country.

### 2. Add the country to `data/devices.json`

```json
"Australia": {
  "currency": "AUD",
  "symbol": "A$",
  "devices": {
    "iPhone 18 Pro": 2199,
    "iPhone Duo": 3499,
    "Apple Watch 12": 699,
    "Apple Watch Ultra 4": 1399,
    "AirPods 5": 219
  }
}
```

- `currency` is the ISO 4217 code you checked in step 1.
- `symbol` is what Apple's local store shows, and is used for display only.
- `devices` must list **exactly** the same device names as the `USA` entry — the
  tests enforce this. Use each device's base-model price on Apple's local store,
  including local tax where the listed price includes it, and nothing else.

### 3. Add the country to the dropdown in `index.html`

```html
<option value="Australia">Australia</option>
```

The `value` must match the `data/devices.json` key character for character —
nothing validates this, and a mismatch silently leaves the calculator on the
previous country.

### 4. Regenerate the conversion rates

```bash
node scripts/fetch-rates.js
```

The request currencies are derived from `data/devices.json`, so there is nothing
to edit here — but the file will not contain your new country until you run this.

### 5. Run the tests

```bash
node --test
```

### 6. Commit all three files

```bash
git add data/devices.json data/conversionRate.json index.html
git commit -m "Add Australia"
```

## When something fails

| What you see | What it means |
| --- | --- |
| `Australia has no entry in conversionRate.json` | You skipped step 4, or the ECB does not publish that currency — re-run step 1. |
| `Keeping the committed conversion rates: the response did not cover every country in devices.json` | Same cause. The fetch script leaves the old file alone rather than writing a partial one. |
| `Keeping the committed conversion rates: Frankfurter returned HTTP 422` | The currency code is not valid ISO 4217. |
| `Australia does not match the USA device list` | The device names in step 2 do not match the `USA` entry exactly. |
| `Australia / iPhone Duo = null` | A price is missing or is not a positive number. |

A failed rate fetch is deliberately not a build failure — the site ships the
last known-good rates instead of going down. That is why step 4 is a real step
and not something the deploy will quietly fix for you.
