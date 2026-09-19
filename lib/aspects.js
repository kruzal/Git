/*
 * DRISHTI (aspects) and conjunctions.
 *
 * Every planet aspects the 7th house from itself. Some aspect further:
 *   Jupiter   5th and 9th
 *   Saturn    3rd and 10th
 *   Mars      4th and 8th
 *   Rahu/Ketu 5th and 9th
 *
 * Counting starts at the planet's own house as 1 and runs anticlockwise.
 */

const SPECIAL = { Jupiter: [5, 9], Saturn: [3, 10], Mars: [4, 8], Rahu: [5, 9], Ketu: [5, 9] };
const UNIVERSAL = 7;

const wrap = (house) => ((house - 1) % 12) + 1;

/** Houses a planet aspects, given the house it sits in. */
function aspectedHouses(planetName, fromHouse) {
  const counts = [UNIVERSAL, ...(SPECIAL[planetName] || [])];
  return counts.map((n) => ({ count: n, house: wrap(fromHouse + n - 1) }));
}

/** Every planet that casts an aspect onto a given house. */
function aspectsOnHouse(chart, house) {
  return chart.planets.flatMap((p) =>
    aspectedHouses(p.name, p.house)
      .filter((a) => a.house === house)
      .map((a) => ({ planet: p.name, count: a.count, from: p.house })));
}

/** Planets sharing a house, grouped. Rahu and Ketu are always opposite, never together. */
function conjunctions(chart) {
  const byHouse = {};
  chart.planets.forEach((p) => { (byHouse[p.house] ||= []).push(p); });
  return Object.entries(byHouse)
    .filter(([, list]) => list.length > 1)
    .map(([house, list]) => ({
      house: Number(house),
      sign: list[0].sign,
      planets: list.map((p) => p.name),
      pairs: list.flatMap((a, i) => list.slice(i + 1).map((b) => [a.name, b.name])),
    }));
}

/** Do two planets aspect each other? Used for yoga detection. */
function mutualAspect(chart, a, b) {
  const pa = chart.planets.find((p) => p.name === a);
  const pb = chart.planets.find((p) => p.name === b);
  if (!pa || !pb) return false;
  const aHitsB = aspectedHouses(a, pa.house).some((x) => x.house === pb.house);
  const bHitsA = aspectedHouses(b, pb.house).some((x) => x.house === pa.house);
  return aHitsB && bHitsA;
}

/**
 * Everything connected to a house: occupants, its lord, and planets aspecting it.
 * This is the standard way any bhava is judged.
 */
function connectedToHouse(chart, house, signLords) {
  const signIndex = (chart.ascendant.signIndex + house - 1) % 12;
  const lordName = signLords[signIndex];
  const lord = chart.planets.find((p) => p.name === lordName);
  return {
    house,
    signIndex,
    occupants: chart.planets.filter((p) => p.house === house).map((p) => p.name),
    lord: lordName,
    lordHouse: lord ? lord.house : null,
    aspectedBy: aspectsOnHouse(chart, house),
  };
}

module.exports = { aspectedHouses, aspectsOnHouse, conjunctions, mutualAspect, connectedToHouse, SPECIAL };
