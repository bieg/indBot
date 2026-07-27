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
let _lastDarkTrigger = 0;
let _lastLightTrigger = 0;
const COOLDOWN = 2000;

export function setOnMood(fn) { _onMood = fn; }

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
  r.maxAlternatives  = 1;
  r.onresult         = _onResult;
  r.onerror          = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    console.warn(`speech [${lang}]:`, e.error);
  };
  r.onend = () => { try { r.start(); } catch (_) {} };
  try { r.start(); } catch (_) {}
}

function _onResult(event) {
  const now = performance.now();

  for (let i = event.resultIndex; i < event.results.length; i++) {
    const transcript = event.results[i][0].transcript.toLowerCase();
    const words = transcript.split(/\s+/);

    for (const raw of words) {
      const word = raw.replace(/[^a-z]/g, '');
      if (!word) continue;

      if (DARK_WORDS.has(word) && now - _lastDarkTrigger > COOLDOWN) {
        _lastDarkTrigger = now;
        if (_onMood) _onMood({ mood: 'dark', word });
        return;
      }
      if (LIGHT_WORDS.has(word) && now - _lastLightTrigger > COOLDOWN) {
        _lastLightTrigger = now;
        if (_onMood) _onMood({ mood: 'light', word });
        return;
      }
    }
  }
}
