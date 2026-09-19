// SVG renderers: North Indian diamond chart (Vedic) and a circular wheel (Western).
const VidhyaChart = (() => {
  const ABBR = { Sun: 'Su', Moon: 'Mo', Mercury: 'Me', Venus: 'Ve', Mars: 'Ma', Jupiter: 'Ju', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke' };
  const GLYPHS = ['♈︎', '♉︎', '♊︎', '♋︎', '♌︎', '♍︎', '♎︎', '♏︎', '♐︎', '♑︎', '♒︎', '♓︎'];

  // North Indian: houses are fixed in place, signs rotate. Centres are for a 400×400 box.
  const HOUSE_CENTRES = [[200, 110], [100, 45], [45, 100], [110, 200], [45, 300], [100, 355], [200, 290], [300, 355], [355, 300], [290, 200], [355, 100], [300, 45]];

  function northIndian(chart) {
    const byHouse = Array.from({ length: 12 }, () => []);
    chart.planets.forEach((p) => byHouse[p.house - 1].push(ABBR[p.name] + (p.retrograde && !['Rahu', 'Ketu'].includes(p.name) ? 'ᴿ' : '')));

    const houses = HOUSE_CENTRES.map(([x, y], i) => {
      const signNum = ((chart.ascendant.signIndex + i) % 12) + 1;
      const items = i === 0 ? ['Asc', ...byHouse[i]] : byHouse[i];
      const small = [1, 2, 4, 5, 7, 8, 10, 11].includes(i);
      const perRow = small ? 2 : 3;
      const rows = [];
      for (let r = 0; r < items.length; r += perRow) rows.push(items.slice(r, r + perRow));
      const startY = y - ((rows.length - 1) * 15) / 2 + 6;
      const numY = small ? y - 22 : y - 34;
      return `
        <text class="house-num" x="${x}" y="${numY}" text-anchor="middle">${signNum}</text>
        ${rows.map((row, r) => `<text class="planet" x="${x}" y="${startY + r * 15}" text-anchor="middle">${row
          .map((t) => (t === 'Asc' ? `<tspan class="asc">${t}</tspan>` : t)).join(' ')}</text>`).join('')}`;
    }).join('');

    return `
      <svg class="chart-svg" viewBox="-4 -4 408 408" role="img" aria-label="North Indian kundli chart, ascendant ${chart.ascendant.sign}">
        <rect class="frame" x="0" y="0" width="400" height="400" rx="4"/>
        <path class="line" d="M0 0 L400 400 M400 0 L0 400 M200 0 L400 200 L200 400 L0 200 Z"/>
        ${houses}
      </svg>`;
  }

  function wheel(chart) {
    const cx = 200, cy = 200, rOuter = 190, rSigns = 160, rInner = 130;
    const asc = chart.ascendant.longitude;
    // Ascendant sits at 9 o'clock; zodiac runs counter-clockwise.
    const point = (lon, r) => {
      const a = ((180 + lon - asc) * Math.PI) / 180;
      return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
    };

    let svg = `<svg class="chart-svg" viewBox="0 0 400 400" role="img" aria-label="Western birth chart wheel, ascendant ${chart.ascendant.sign}">
      <circle class="frame" cx="${cx}" cy="${cy}" r="${rOuter}"/>
      <circle class="line" cx="${cx}" cy="${cy}" r="${rSigns - 15}"/>
      <circle class="line" cx="${cx}" cy="${cy}" r="${rInner - 60}"/>`;

    for (let i = 0; i < 12; i++) {
      const [x1, y1] = point(i * 30, rOuter);
      const [x2, y2] = point(i * 30, rInner - 60);
      const [gx, gy] = point(i * 30 + 15, rSigns + 7);
      svg += `<line class="line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>
        <text class="sign-label" x="${gx}" y="${gy + 5}" text-anchor="middle">${GLYPHS[i]}</text>`;
    }

    const [ax, ay] = point(asc, rOuter);
    const [dx, dy] = point(asc + 180, rOuter);
    svg += `<line x1="${ax}" y1="${ay}" x2="${dx}" y2="${dy}" stroke="var(--gold)" stroke-width="1.5" stroke-dasharray="4 4"/>
      <text class="asc" x="${ax + 4}" y="${ay - 6}" font-size="12">Asc</text>`;

    // Spread planets that sit close together onto staggered radii.
    const sorted = [...chart.planets].sort((a, b) => a.longitude - b.longitude);
    let prev = -999, level = 0;
    sorted.forEach((p) => {
      level = p.longitude - prev < 9 ? (level + 1) % 3 : 0;
      prev = p.longitude;
      const [px, py] = point(p.longitude, rInner - level * 20);
      const [tx, ty] = point(p.longitude, rSigns - 15);
      const [ix, iy] = point(p.longitude, rSigns - 22);
      svg += `<line class="line" x1="${tx}" y1="${ty}" x2="${ix}" y2="${iy}"/>
        <text class="planet" x="${px}" y="${py + 4}" text-anchor="middle">${ABBR[p.name]}</text>`;
    });
    return svg + '</svg>';
  }

  return { northIndian, wheel };
})();
