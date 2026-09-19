// Nwaran naming: the traditional first syllable of the ritual name comes from the
// Moon's nakshatra and pada at birth. Four syllables per nakshatra, in pada order.
const SYLLABLES = [
  ['Chu', 'Che', 'Cho', 'La'],       // Ashwini
  ['Li', 'Lu', 'Le', 'Lo'],          // Bharani
  ['A', 'I', 'U', 'E'],              // Krittika
  ['O', 'Va', 'Vi', 'Vu'],           // Rohini
  ['Ve', 'Vo', 'Ka', 'Ki'],          // Mrigashira
  ['Ku', 'Gha', 'Ing', 'Chha'],      // Ardra
  ['Ke', 'Ko', 'Ha', 'Hi'],          // Punarvasu
  ['Hu', 'He', 'Ho', 'Da'],          // Pushya
  ['Di', 'Du', 'De', 'Do'],          // Ashlesha
  ['Ma', 'Mi', 'Mu', 'Me'],          // Magha
  ['Mo', 'Ta', 'Ti', 'Tu'],          // Purva Phalguni
  ['Te', 'To', 'Pa', 'Pi'],          // Uttara Phalguni
  ['Pu', 'Sha', 'Na', 'Tha'],        // Hasta
  ['Pe', 'Po', 'Ra', 'Ri'],          // Chitra
  ['Ru', 'Re', 'Ro', 'Ta'],          // Swati
  ['Ti', 'Tu', 'Te', 'To'],          // Vishakha
  ['Na', 'Ni', 'Nu', 'Ne'],          // Anuradha
  ['No', 'Ya', 'Yi', 'Yu'],          // Jyeshtha
  ['Ye', 'Yo', 'Bha', 'Bhi'],        // Mula
  ['Bhu', 'Dha', 'Pha', 'Dha'],      // Purva Ashadha
  ['Bhe', 'Bho', 'Ja', 'Ji'],        // Uttara Ashadha
  ['Ju', 'Je', 'Jo', 'Gha'],         // Shravana
  ['Ga', 'Gi', 'Gu', 'Ge'],          // Dhanishta
  ['Go', 'Sa', 'Si', 'Su'],          // Shatabhisha
  ['Se', 'So', 'Da', 'Di'],          // Purva Bhadrapada
  ['Du', 'Tha', 'Jha', 'Tra'],       // Uttara Bhadrapada
  ['De', 'Do', 'Cha', 'Chi'],        // Revati
];

function suggestSyllable(nakshatraIndex, pada) {
  return SYLLABLES[nakshatraIndex]?.[pada - 1] || null;
}

module.exports = { suggestSyllable, SYLLABLES };
