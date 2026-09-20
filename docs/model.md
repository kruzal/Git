# Vidhya — system model

How the data is shaped, why it is shaped that way, and how to use it for
research rather than only for readings.

---

## 1. The flow

Five stages, strictly one-directional. Nothing downstream writes upstream.

```
  EPHEMERIS          raw astronomy — longitudes, no meaning
       ↓
  CHART              sidereal positions, houses, nakshatras
       ↓
  INDICATORS         flat, typed, stably-named measurements
       ↓
  RULES              indicator patterns → claims, with provenance
       ↓
  RENDER             tier filter, ordering, prose
```

The important boundary is **INDICATORS → RULES**. Everything above it is
computation that can be independently verified. Everything below it is
interpretation that can be disputed, sourced and tested. Keeping them apart is
what makes the system researchable instead of just opinionated.

| Stage | Module | Verifiable against |
|---|---|---|
| Ephemeris | `astronomy-engine` | published ephemerides |
| Chart | `lib/astro.js` | any panchang or chart software |
| Indicators | `lib/indicators.js` | the chart, by arithmetic |
| Rules | `lib/rules.js`, `lib/interpret.js` | sources in the corpus |
| Render | `lib/interpret.js`, pages | policy in §6 |

---

## 2. Entities

Only five primitive types. Everything else is derived from them, which is what
keeps the data non-redundant.

| Entity | Cardinality | Key | Notes |
|---|---|---|---|
| **Graha** | 9 | name | Sun…Ketu. Rahu and Ketu own no sign. |
| **Rashi** | 12 | index 0–11 | Sidereal. Ayanamsa is a chart property, not a sign property. |
| **Bhava** | 12 | number 1–12 | Whole-sign. Fixed relative to the lagna. |
| **Nakshatra** | 27 (×4 padas) | index 0–26 | Lord is `index % 9` — deterministic, so it validates itself. |
| **Point** | derived | name | Lagna, Arudha, Muntha, karakas. Computed, never stored. |

**Derived points are never persisted.** Storing the Arudha would let it drift
out of sync with the chart it came from. It costs nothing to recompute.

---

## 3. Relations

Six relations connect the entities. Every reading in the system is a statement
about one or more of these — there are no others.

| Relation | Domain → range | Where |
|---|---|---|
| `occupies` | graha → rashi, graha → bhava | `astro.js` |
| `rules` | graha → rashi | `SIGN_LORDS` |
| `aspects` | graha → bhava | `aspects.js` |
| `disposits` | graha → graha | `strength.js` |
| `ranks` | graha → karaka | `lenses.js` |
| `activates` | graha → time window | `dasha.js`, `varsha.js` |

`aspects` is the one people get wrong. All grahas reach the 7th; Jupiter
adds 5 and 9, Saturn 3 and 10, Mars 4 and 8, the nodes 5 and 9. Counting
starts at the graha's own house as 1.

---

## 4. The indicator contract

An indicator is the atomic unit of measurement. One row:

```js
{
  id:         'graha.Saturn.strength',   // stable across every chart, forever
  layer:      'natal',                   // natal|dasha|varsha|transit|numerology|western
  kind:       'scalar',                  // categorical|ordinal|scalar|boolean
  subject:    'Saturn',                  // grouping key
  value:      6.6,
  derivation: 'weighted composite of six inputs, 0–10'
}
```

Four rules govern it:

1. **IDs never change.** A chart computed today and one computed in five years
   are directly comparable. Renaming an id is a breaking change.
2. **`kind` picks the statistics.** Categorical gets frequencies and chi-square;
   ordinal gets rank correlation; scalar gets means and regression; boolean gets
   proportions. Getting this wrong is the usual way astrological "research"
   goes bad — treating house numbers as a scale and averaging them.
3. **`derivation` is mandatory.** Any number in the system can be traced to the
   arithmetic that produced it without reading the source.
4. **Indicators never interpret.** `graha.Saturn.house = 11` is a measurement.
   "Saturn in the 11th gives gains through friends" is a rule.

A standard chart produces about **258 indicators** — 236 natal plus the
time-varying layers.

---

## 5. Strength, as a worked example of layering

`graha.X.strength` is the only composite in the system, and it is deliberately
built from six independently-sourced inputs so any one can be re-weighted or
dropped without rewriting anything:

| Input | Indicator | Weight | Source |
|---|---|---|---|
| Sign dignity | `dignity_rank` | 3.0 | Saturn video, sign classes |
| Natural house dignity | — | 1.0 | Kaal Purusha overlay |
| Avastha by degree | `avastha_rank` | 1.5 | Kundli basics, degree table |
| Combustion | `combust` | 1.0 | Jupiter video, chart notation |
| Motion | `retrograde` | 1.0 | Jupiter video |
| Dispositor condition | `dispositor` | 2.0 | Moon / mental-state video |

Every input is also exposed as its own indicator, so research can test whether
the composite outperforms any single component — or whether the weights are
doing anything at all.

---

## 6. Rules and provenance

A rule is a claim attached to an indicator pattern.

```js
{
  id:          'saturn_h2_speech',
  when:        { 'graha.Saturn.house': 2 },
  text:        '…',
  tier:        'open',            // open | guarded | restricted
  school:      'parashari',       // parashari | jaimini | lal-kitab | modern | numerology
  sources:     ['004@11:16', '015@10:49'],
  confidence:  0.8                // f(independent sources, classical attestation)
}
```

**Tiers** control display, not truth:

| Tier | Behaviour |
|---|---|
| `open` | shown to everyone |
| `guarded` | shown, framed as a tendency rather than a verdict |
| `restricted` | never auto-shown; consultation only |

**Excluded by policy, not tiered** — these do not enter the corpus at all:
predictions of mental illness or suicidal ideation, third-party medical
diagnosis, infidelity, addiction, and any advice that reduces a person's
contact with people who support them.

**School matters.** Lal Kitab says Rahu signifies in-laws; Parashari says
grandfather. Both are recorded, neither is resolved. A corpus that silently
picks one loses the ability to ask which predicts better.

---

## 7. Self-validation

Some structures are deterministic and therefore audit their own sources:

| Check | Rule | Catches |
|---|---|---|
| Nakshatra lord | `NAKSHATRA_LORDS[i % 9]` | three wrong lords in one source video |
| Sign lord | fixed 12-entry table | any misattribution |
| Aspect houses | counted from occupancy | mis-stated drishti |
| Karaka rank | sort by degree | ordering errors |
| Solar return | Sun's sidereal longitude matches natal | verified to 1.4e-4 arcsec |
| Celebrity charts | one person, one nakshatra | a source naming Tagore twice |

Any incoming source is checked against these before ingestion. Failures are
flagged, not silently merged.

---

## 8. Research use

The indicator vector is a dataframe row. That is the whole point.

```js
const { vector } = require('./lib/indicators');
const row = vector(chart, { dasha, varsha, numerology, western }, { asMap: true });
// → { 'graha.Saturn.house': 11, 'graha.Saturn.strength': 6.6, … }
```

With N charts and an outcome column you can ask real questions:

- Do people with `graha.Saturn.house = 7` marry later than the base rate?
- Does `graha.X.strength` predict anything the raw `dignity_rank` does not?
- Is `karaka.dara` a better marriage signifier than `bhava.7.lord_house`?
- Do the three schools disagree in ways that show up in outcomes?

**What makes this honest rather than decorative:**

1. **Pre-register the hypothesis.** 258 indicators against any outcome will
   produce spurious hits at p < 0.05 by construction — roughly 13 of them.
   Decide what you are testing before you look.
2. **Correct for multiple comparisons.** Bonferroni or FDR. Without it the
   results are noise with a decimal point.
3. **Get a base rate.** "Eight of my twelve clients with this yoga had X" means
   nothing without knowing how common X is in people without it.
4. **Hold out data.** Fit on one set, test on another. Astrology is unusually
   prone to fitting after the fact, because every chart has enough features to
   explain any outcome retrospectively.
5. **Birth time is the limiting variable.** The lagna moves a full sign every
   two hours. Records without a verified time can support Moon-sign and dasha
   research but not house-based research, and should be flagged as such in
   any dataset.

The system does not claim astrology works. It makes the claims specific enough
to be checked, which is the part that has usually been missing.

---

## 9. Where things live

```
lib/
  astro.js        positions, houses, nakshatras, ayanamsa
  aspects.js      drishti, conjunctions, house connections
  strength.js     six inputs → composite score
  dasha.js        Vimshottari periods
  varsha.js       solar return, muntha, year window, transits
  lenses.js       karakas, arudha, life areas, remedies
  numerology.js   driver, conductor, name numbers, Lo Shu
  western.js      tropical placements, degree aspects, balance
  indicators.js   ← the research boundary
  interpret.js    rules → sections, tier filtering
  rules.js        the editable rule corpus
docs/
  model.md        this file
```
