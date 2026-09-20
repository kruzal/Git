/*
 * DEVATA LAYER — the hierarchy above the grahas.
 *
 * In the Parashari frame the grahas are not causes. They are agents: the
 * mechanism through which a result already owed to you is delivered. Above
 * them sit the devatas, and above those the one Ishvara. Source 002 states it
 * plainly — "ईश्वर के एजेंट होते हैं" — the planets work on God's behalf.
 *
 * The chain runs:
 *
 *   Ishvara  →  Trimurti  →  Adhidevata  →  Graha  →  Bhava  →  event
 *
 * Practically, that ordering says: a difficult graha is not addressed by
 * fighting the graha, but by turning to the devata it answers to.
 *
 * NOTE ON SOURCES. Deity assignments vary by text and region. The adhidevata
 * and pratyadhidevata lists below follow Brihat Parashara Hora Shastra; the
 * avatar correspondence follows the common Dashavatara tradition; popular
 * practice often differs. Where they diverge, all readings are kept — the
 * corpus does not resolve school disagreements, it records them.
 *
 * This describes a tradition. It does not assert that observance produces
 * outcomes, and nothing here is offered as a substitute for medical,
 * financial or legal help.
 */

const DEVATAS = {
  Sun: {
    graha: 'Sun', sanskrit: 'Surya',
    adhidevata: 'Agni', pratyadhidevata: 'Shiva',
    popular: 'Surya Narayana', avatar: 'Rama',
    governs: 'authority, recognition, vitality, the father',
    blessing: 'To be seen clearly, and to hold authority without needing to defend it.',
    quality: 'Dignity — the capacity to lead without diminishing anyone.',
    observance: 'Water offered to the rising sun, between roughly six and eight. Punctuality kept as a discipline rather than a courtesy.',
    day: 'Sunday',
  },
  Moon: {
    graha: 'Moon', sanskrit: 'Chandra',
    adhidevata: 'Varuna', pratyadhidevata: 'Gauri',
    popular: 'Parvati', avatar: 'Krishna',
    governs: 'mind, memory, comfort, the mother',
    blessing: 'A settled mind, and the ability to be at ease in your own company.',
    quality: 'Equanimity — steadiness that does not depend on circumstances staying still.',
    observance: 'Kheer made yourself and given to elderly people. Ten quiet minutes of breath before sleep.',
    day: 'Monday',
  },
  Mars: {
    graha: 'Mars', sanskrit: 'Mangala',
    adhidevata: 'Bhumi', pratyadhidevata: 'Subrahmanya',
    popular: 'Hanuman', avatar: 'Narasimha',
    governs: 'courage, conflict, land, siblings',
    blessing: 'Strength that protects rather than dominates.',
    quality: 'Restraint — force that knows when not to be used.',
    observance: 'Physical effort given an honest outlet. Service where strength is needed rather than admired.',
    day: 'Tuesday',
  },
  Mercury: {
    graha: 'Mercury', sanskrit: 'Budha',
    adhidevata: 'Vishnu', pratyadhidevata: 'Narayana',
    popular: 'Vishnu', avatar: 'Buddha',
    governs: 'intellect, speech, trade, learning',
    blessing: 'Clear speech, and judgement that survives contact with detail.',
    quality: 'Discernment — telling the true thing from the clever thing.',
    observance: 'Teach what you know. Support a child\'s schooling if you are able.',
    day: 'Wednesday',
  },
  Jupiter: {
    graha: 'Jupiter', sanskrit: 'Brihaspati',
    adhidevata: 'Indra', pratyadhidevata: 'Brahma',
    popular: 'Dakshinamurthy', avatar: 'Vamana',
    governs: 'wisdom, teachers, children, meaning',
    blessing: 'Guidance arriving when you have run out of your own answers.',
    quality: 'Humility — the knowledge that you do not know, which is what knowledge is.',
    observance: 'Find a teacher, and teach aloud what you already hold. Turmeric water at the banana tree.',
    day: 'Thursday',
  },
  Venus: {
    graha: 'Venus', sanskrit: 'Shukra',
    adhidevata: 'Indrani', pratyadhidevata: 'Indra',
    popular: 'Lakshmi', avatar: 'Parashurama',
    governs: 'love, beauty, comfort, the spouse',
    blessing: 'Sweetness in what you have, rather than the hunger for more of it.',
    quality: 'Fidelity — to people, and to the promises you made them.',
    observance: 'Keep your word. Keep yourself and your surroundings with care.',
    day: 'Friday',
  },
  Saturn: {
    graha: 'Saturn', sanskrit: 'Shani',
    adhidevata: 'Brahma', pratyadhidevata: 'Yama',
    popular: 'Shani Dev, and Hanuman as his restrainer', avatar: 'Kurma',
    governs: 'work, endurance, time, the poor',
    blessing: 'What is earned, given late and kept permanently.',
    quality: 'Patience — continuing without the reward being visible yet.',
    observance: 'Water at the peepal on Saturdays. Simple food one day a week. Feed those whose work is physical.',
    day: 'Saturday',
  },
  Rahu: {
    graha: 'Rahu', sanskrit: 'Rahu',
    adhidevata: 'Durga', pratyadhidevata: 'Kala',
    popular: 'Durga', avatar: 'Varaha',
    governs: 'ambition, illusion, foreign things, obsession',
    blessing: 'Seeing what you have actually been chasing.',
    quality: 'Clarity — the ability to tell a real want from a borrowed one.',
    observance: 'Watch how you speak about yourself. Picture, in practical detail, the life you want.',
    day: 'Saturday',
  },
  Ketu: {
    graha: 'Ketu', sanskrit: 'Ketu',
    adhidevata: 'Chitragupta', pratyadhidevata: 'Brahma',
    popular: 'Ganesha', avatar: 'Matsya',
    governs: 'detachment, instinct, liberation, loss',
    blessing: 'Release from what you were holding past its time.',
    quality: 'Non-attachment — holding without gripping.',
    observance: 'Travel. Mountains and water. Service given without your name on it.',
    day: 'Tuesday',
  },
};

// The ladder, top to bottom. Used to explain *why* a remedy addresses the
// devata rather than the graha.
const HIERARCHY = [
  { level: 0, name: 'Ishvara', role: 'The one, undivided. Not petitioned for outcomes.' },
  { level: 1, name: 'Trimurti', role: 'Brahma creates, Vishnu sustains, Shiva dissolves — the three motions of any process.' },
  { level: 2, name: 'Adhidevata', role: 'The presiding deity a graha answers to. A difficult graha is approached here, not fought directly.' },
  { level: 3, name: 'Graha', role: 'The agent. It delivers what is already owed; it does not decide it.' },
  { level: 4, name: 'Bhava', role: 'The area of life the delivery lands in.' },
  { level: 5, name: 'You', role: 'Where the result becomes an event, and where the response is yours.' },
];

/**
 * Devata guidance for one chart, ordered by which graha most needs attention.
 * `strengths` comes from lib/strength.
 */
function devataReport(strengths, dashaLord) {
  const ordered = Object.values(strengths).sort((a, b) => a.score - b.score);
  return {
    hierarchy: HIERARCHY,
    // The weakest graha is where practice has the most work to do.
    primary: { ...DEVATAS[ordered[0].planet], score: ordered[0].score, band: ordered[0].band, reason: 'the graha carrying most strain in your chart' },
    // The dasha lord is what the current years are actually about.
    current: dashaLord ? { ...DEVATAS[dashaLord], reason: 'the lord of the period you are living through' } : null,
    strongest: { ...DEVATAS[ordered.at(-1).planet], score: ordered.at(-1).score, reason: 'already working for you — this is what to give from' },
    all: ordered.map((s) => ({ ...DEVATAS[s.planet], score: s.score, band: s.band })),
  };
}

module.exports = { DEVATAS, HIERARCHY, devataReport };
