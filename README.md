# The Marco Offset

This is the repository for the website [TheMarcoOffset](https://themarcooffset.com), a calculator to figure out your Marco Offset amount.

## What is The Marco Offset?

The Marco Offset is a way to calculate your minimum donation to Relay for the St. Jude fundraiser based on a method devised by [Marco Arment](marco.org) on the [Accidental Tech Podcast](atp.fm). 

To calculate:
1. Subtract the base model price of an iPhone or iPhone Pro from your total purchase price.
2. The difference is your minimum donation.

### Include in your total purchase price:
- Phone upgrades (storage, size, etc.)
- Accessories
- AppleCare (monthly cost multiplied by 12)
- Taxes
- Shipping costs

## The three levels

As of [ATP 707](https://atp.fm/707), the offset has three levels. Pick whichever one you can swing:

| Level | Formula |
| --- | --- |
| **1 — Base Offset** | `total purchase − base price` (the original offset, unchanged) |
| **2** | Level 1 `+` what you spent on AI this month |
| **3** | Level 1 `+` what you spent on AI this year |

Two rules apply throughout:

- **Nothing goes negative.** If your purchase total lands at or below base price, level 1 contributes `0` rather than a negative that would eat into the AI portion. Negative entries in any field read as `0`.
- **AI costs are entered in your local currency**, like every other field, and are converted to USD along with the rest of the offset.

On level 3 the annual figure auto-fills as monthly × 12, and you can type over it — for a subscription plus metered usage, an annual plan, or a plan you started partway through the year. Clearing the field resumes auto-filling.

## Development

The site is static: no build step, no dependencies, no `package.json`. Open `index.html` or serve the folder with `python3 -m http.server`.

The offset arithmetic lives in `assets/js/calculator.js` as pure functions with no DOM access, so it is testable directly. `assets/js/script.js` handles the page wiring and calls into it.

```
node --test
```

Netlify runs that same command on every deploy (see `netlify.toml`), so a failing test blocks the deploy.

## Enhancements to Add

- **Multi-country support**: Expand the functionality to support different currencies. Thinking best to probably add Canada, GBR, and the Euro. [Github Issue](https://github.com/bjbech/the-marco-offset/issues/4)
- **Additional Apple products**: Support for calculating donations based on the purchase of other Apple products such as Apple Watch, AirPods, etc.
- **Product selection checkboxes**: Replace the current dropdown of iPhone models with checkboxes for multiple product types (e.g., iPhone, Watch, AirPods) to allow users to select multiple products.

## How to Contribute

1. Fork the repository.
2. Create a new branch.
3. Make your changes and submit a pull request.

## Change Log
2026-09-08: Added the three offset levels from ATP 707 (base, plus monthly AI cost, plus annual AI cost). Extracted the offset math into `assets/js/calculator.js` and covered it with `node --test`.  
2025-09-10: Redesign of website to now make it a calculator of all products released in the September Apple event. Add the ability to select countries. To start added USA, Canada, UK, and Italy.  
2025-09-09: Updated to 2025 campaign and iPhone release information; Added functionality where the sub-campaign link auto passes along your suggested minimum donation as a parameter  
2024-09-12: Updated to 2025 campaign and iPhone release information.  
2023-09-18: Rename "Apple Care" to "AppleCare"  
2023-09-15: Corrected typo  
2023-09-13: Sub-campaign added to the page  
2023-09-12: Inital commit; added Pico CSS; Fixed decimal formatting of minimum donation  
