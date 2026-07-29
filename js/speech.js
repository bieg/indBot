// These six words trigger the dramatic contraction → explosion star animation
const NEGATIVE_WORDS = new Set([
  'storm', 'storms', 'storming',
  'dark', 'darker', 'darkest',
  'shit', 'shitty',
  'damn', 'damned', 'dammit',
  'klote', 'klotenzooi',
  'verdomme', 'verdomd',
]);

const DARK_WORDS = new Set([
  // English
  'dark', 'darkness', 'dying', 'die', 'dead', 'death', 'storm', 'stormy',
  'moody', 'depression', 'depressed', 'sad', 'sadness', 'broken', 'lost',
  'alone', 'lonely', 'pain', 'hurt', 'hollow', 'empty', 'void', 'shadow',
  'shadows', 'fear', 'hate', 'hatred', 'cold', 'numb', 'cry', 'crying',
  'tears', 'tear', 'fallen', 'heavy', 'chaos', 'rage', 'destroy', 'destroyed',
  'burn', 'burning', 'fade', 'fading', 'scream', 'screaming', 'wound',
  'wounded', 'war', 'battle', 'blood', 'bleed', 'bleeding', 'black',
  'nightmare', 'ghost', 'haunted', 'hopeless', 'helpless', 'shattered',
  'bleak', 'grim', 'dread', 'horror', 'despair', 'misery', 'anguish',
  'torment', 'violent', 'violence', 'silence', 'ruin', 'ruined',
  'suffocating', 'trapped', 'sink', 'sinking', 'drown', 'drowning',
  'falling', 'fall', 'collapse', 'collapsing', 'disturbed', 'boom',
  'crash', 'crashing', 'break', 'breaking',
  // Nederlands
  'donker', 'duisternis', 'sterven', 'dood', 'sterft', 'storm', 'stormig',
  'somber', 'depressie', 'depressief', 'droevig', 'droevigheid', 'verdriet',
  'gebroken', 'verloren', 'alleen', 'eenzaam', 'pijn', 'leeg', 'leegte',
  'schaduw', 'angst', 'haat', 'koud', 'gevoelloos', 'huilen', 'tranen',
  'gevallen', 'zwaar', 'chaos', 'woede', 'vernietigen', 'vernietigd',
  'branden', 'vervagen', 'schreeuwen', 'schreeuw', 'wond', 'oorlog',
  'bloed', 'bloeden', 'nacht', 'nachtmerrie', 'spook', 'hopeloos',
  'kapot', 'grimmig', 'ontzetting', 'wanhoop', 'ellende', 'marteling',
  'zinken', 'verdrinken', 'vallen', 'instorten', 'verstoord',
]);

const LIGHT_WORDS = new Set([
  // English
  'sunshine', 'sun', 'sunny', 'light', 'happy', 'happiness', 'joy', 'joyful',
  'friends', 'friend', 'family', 'love', 'loving', 'hope', 'hopeful', 'smile',
  'smiling', 'bright', 'warm', 'warmth', 'bloom', 'flower', 'flowers',
  'beautiful', 'beauty', 'peace', 'peaceful', 'free', 'freedom', 'dance',
  'dancing', 'fly', 'flying', 'glow', 'glowing', 'golden', 'sweet', 'alive',
  'together', 'dream', 'dreaming', 'float', 'floating', 'gentle', 'rise',
  'rising', 'sing', 'singing', 'birds', 'bird', 'bees', 'bee', 'spring',
  'morning', 'sky', 'heart', 'laugh', 'laughing', 'laughter', 'grace',
  'magical', 'magic', 'wonder', 'wonderful', 'amazing', 'fantastic', 'walking',
  'walk', 'breathe', 'breathing', 'life', 'live', 'living', 'touch', 'touched',
  'sparkle', 'shine', 'shining', 'soft', 'softly', 'soar', 'soaring',
  'celebrate', 'celebration', 'good', 'great', 'better', 'positive', 'uplifting',
  // Nederlands
  'zonneschijn', 'zon', 'zonnig', 'licht', 'blij', 'blijheid', 'vreugde',
  'vrienden', 'vriend', 'vriendin', 'familie', 'liefde', 'hoop', 'hoopvol',
  'glimlach', 'glimlachen', 'helder', 'warm', 'warmte', 'bloem', 'bloemen',
  'mooi', 'schoonheid', 'vrede', 'vrij', 'vrijheid', 'dansen', 'dans',
  'vliegen', 'gloeien', 'goud', 'gouden', 'zoet', 'levend', 'samen',
  'droom', 'dromen', 'zweven', 'zacht', 'zingen', 'vogels', 'vogel',
  'bijen', 'bij', 'lente', 'ochtend', 'hemel', 'hart', 'lachen', 'gelach',
  'genade', 'magisch', 'magie', 'wonder', 'wonderlijk', 'geweldig',
  'wandelen', 'wandeling', 'ademen', 'leven', 'aanraken', 'stralen',
  'zachtheid', 'feest', 'vieren', 'goed', 'beter', 'positief',
]);

let _onMood = null;
let _onWord = null;
let _lastDarkTrigger = 0;
let _lastLightTrigger = 0;
let _lastNegativeTrigger = 0;
const COOLDOWN = 2000;

export function setOnMood(fn) { _onMood = fn; }
export function setOnWord(fn) { _onWord = fn; }

export function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return false;

  // Two parallel instances — one per language so both are recognised well
  _makeInstance(SR, 'en-US');
  _makeInstance(SR, 'nl-NL');
  return true;
}

function _makeInstance(SR, lang) {
  const r = new SR();
  r.continuous       = true;
  r.interimResults   = true;
  r.lang             = lang;
  r.maxAlternatives  = 3;
  r.onresult         = _onResult;
  r.onerror          = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    console.warn(`speech [${lang}]:`, e.error);
  };
  r.onend = () => { try { r.start(); } catch (_) {} };
  try { r.start(); } catch (_) {}
}

// Common short words to skip for word clouds
const _SKIP = new Set([
  'the','and','that','this','with','have','from','they','will','been','were',
  'their','what','when','your','said','each','which','she','him','his','her',
  'een','het','van','dat','zijn','maar','voor','niet','met','ook','die',
  'door','naar','wel','kan','bij','heeft','wordt','werd','wat','wie','hoe',
]);

function _onResult(event) {
  const now = performance.now();
  let moodTriggered = false;

  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];

    // Check all alternatives for trigger words — gives recognizer more chances to match
    outer:
    for (let alt = 0; alt < result.length; alt++) {
      const words = result[alt].transcript.toLowerCase().split(/\s+/);
      for (const raw of words) {
        const word = raw.replace(/[^a-z]/g, '');
        if (!word) continue;

        if (NEGATIVE_WORDS.has(word) && now - _lastNegativeTrigger > COOLDOWN) {
          _lastNegativeTrigger = now;
          if (_onMood) _onMood({ mood: 'negative', word });
          moodTriggered = true;
          break outer;
        }
        if (DARK_WORDS.has(word) && now - _lastDarkTrigger > COOLDOWN) {
          _lastDarkTrigger = now;
          if (_onMood) _onMood({ mood: 'dark', word });
          moodTriggered = true;
          break outer;
        }
        if (LIGHT_WORDS.has(word) && now - _lastLightTrigger > COOLDOWN) {
          _lastLightTrigger = now;
          if (_onMood) _onMood({ mood: 'light', word });
          moodTriggered = true;
          break outer;
        }
      }
    }

    // Spawn word clouds only for final results and non-trigger words
    if (result.isFinal && !moodTriggered && _onWord) {
      const words = result[0].transcript.toLowerCase().split(/\s+/);
      for (const raw of words) {
        const word = raw.replace(/[^a-z]/g, '');
        if (word.length < 4) continue;
        if (_SKIP.has(word)) continue;
        if (NEGATIVE_WORDS.has(word) || DARK_WORDS.has(word) || LIGHT_WORDS.has(word)) continue;
        _onWord(word);
      }
    }
  }
}
