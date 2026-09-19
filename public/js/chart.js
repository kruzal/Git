// North Indian kundli: houses are fixed in place, signs rotate through them.
const VidhyaChart = (() => {
  const ABBR = { Sun: 'Su', Moon: 'Mo', Mercury: 'Me', Venus: 'Ve', Mars: 'Ma', Jupiter: 'Ju', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke' };

  // Label centre and the exact cell outline for each house, in a 400×400 box.
  // House 1 is the top-centre diamond; houses run anticlockwise from there.
  const HOUSES = [
    { c: [200, 112], p: '200,0 300,100 200,200 100,100' },
    { c: [100, 46], p: '0,0 200,0 100,100' },
    { c: [46, 100], p: '0,0 100,100 0,200' },
    { c: [112, 200], p: '0,200 100,100 200,200 100,300' },
    { c: [46, 300], p: '0,200 100,300 0,400' },
    { c: [100, 354], p: '0,400 100,300 200,400' },
    { c: [200, 288], p: '200,400 100,300 200,200 300,300' },
    { c: [300, 354], p: '200,400 300,300 400,400' },
    { c: [354, 300], p: '400,400 300,300 400,200' },
    { c: [288, 200], p: '400,200 300,300 200,200 300,100' },
    { c: [354, 100], p: '400,200 300,100 400,0' },
    { c: [300, 46], p: '400,0 300,100 200,0' },
  ];
  // The small corner triangles have less room than the four large diamonds.
  const SMALL = [1, 2, 4, 5, 7, 8, 10, 11];

  function northIndian(chart, { selected = null, strengths = {} } = {}) {
    const byHouse = Array.from({ length: 12 }, () => []);
    chart.planets.forEach((p) => byHouse[p.house - 1].push(p));

    const cells = HOUSES.map(({ c: [x, y], p: outline }, i) => {
      const house = i + 1;
      const signNum = ((chart.ascendant.signIndex + i) % 12) + 1;
      const small = SMALL.includes(i);
      const items = byHouse[i].map((p) => {
        const band = strengths[p.name]?.band;
        const mark = p.retrograde && !['Rahu', 'Ketu'].includes(p.name) ? '℞' : '';
        return { label: ABBR[p.name] + mark, deg: Math.floor(p.degree), weak: band === 'weak' || band === 'strained' };
      });
      const perRow = small ? 2 : 3;
      const rows = [];
      for (let r = 0; r < items.length; r += perRow) rows.push(items.slice(r, r + perRow));
      const startY = y - ((rows.length - 1) * 16) / 2 + 5;

      return `
        <g class="cell ${selected === house ? 'is-selected' : ''}" data-house="${house}" role="button"
           tabindex="0" aria-label="House ${house}, sign ${signNum}">
          <polygon class="hit" points="${outline}"/>
          <text class="house-num" x="${x}" y="${small ? y - 24 : y - 36}" text-anchor="middle">${signNum}</text>
          ${house === 1 ? `<text class="asc" x="${x}" y="${y - 10}" text-anchor="middle">Asc</text>` : ''}
          ${rows.map((row, r) => `<text class="planet" x="${x}" y="${startY + r * 16 + (house === 1 ? 8 : 0)}" text-anchor="middle">${
            row.map((it) => `<tspan class="${it.weak ? 'is-weak' : ''}">${it.label}</tspan><tspan class="deg">${it.deg}</tspan>`).join(' ')
          }</text>`).join('')}
        </g>`;
    }).join('');

    return `
      <svg class="chart-svg" viewBox="-6 -6 412 412" role="img"
           aria-label="North Indian kundli chart, ${chart.ascendant.sign} ascendant">
        <rect class="frame" x="0" y="0" width="400" height="400" rx="4"/>
        <path class="line" d="M0 0 L400 400 M400 0 L0 400 M200 0 L400 200 L200 400 L0 200 Z"/>
        ${cells}
      </svg>`;
  }

  return { northIndian, ABBR };
})();
