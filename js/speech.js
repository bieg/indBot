const DARK_WORDS = new Set([
  'dark','darkness','dying','die','dead','death','storm','stormy','moody',
  'depression','depressed','sad','sadness','broken','lost','alone','lonely',
  'pain','hurt','hollow','empty','void','shadow','fear','hate','cold','numb',
  'cry','tears','fallen','heavy','chaos','rage','destroy','burn','fade',
  'scream','wound','war','battle','blood','bleed','black','nightmare','ghost',
  'haunted','hopeless','helpless','shattered','bleak','dread','horror',
  'despair','misery','anguish','torment','silence','ruin','trapped','sink',
  'drown','falling','collapse','disturbed','boom','crash','break',
  // NL
  'donker','duisternis','sterven','dood','storm','stormig','somber',
  'depressie','depressief','droevig','verdriet','gebroken','verloren',
  'alleen','eenzaam','pijn','leeg','leegte','schaduw','angst','haat','koud',
  'huilen','tranen','gevallen','zwaar','woede','vernietigen','branden',
  'vervagen','schreeuwen','wond','oorlog','bloed','nacht','nachtmerrie',
  'spook','hopeloos','kapot','wanhoop','ellende','zinken','verdrinken',
  'instorten','verstoord',
]);

const LIGHT_WORDS = new Set([
  'sunshine','sun','sunny','light','happy','happiness','joy','joyful',
  'friends','friend','family','love','loving','hope','hopeful','smile',
  'bright','warm','warmth','bloom','flower','beautiful','beauty','peace',
  'free','freedom','dance','fly','glow','golden','sweet','alive','together',
  'dream','float','gentle','rise','sing','birds','bees','bee','spring',
  'morning','sky','heart','laugh','laughter','grace','magic','wonder',
  'wonderful','amazing','walk','breathe','life','live','touch','sparkle',
  'shine','soft','soar','celebrate','good','great','better','positive',
  // NL
  'zonneschijn','zon','zonnig','licht','blij','blijheid','vreugde',
  'vrienden','vriend','vriendin','familie','liefde','hoop','hoopvol',
  'glimlach','helder','warm','warmte','bloem','mooi','vrede','vrij',
  'vrijheid','dansen','vliegen','gloeien','goud','zoet','levend','samen',
  'droom','dromen','zweven','zacht','zingen','vogels','bijen','lente',
  'ochtend','hemel','hart','lachen','gelach','magisch','magie','geweldig',
  'wandelen','ademen','leven','aanraken','stralen','feest','goed','beter',
]);

let _onMood = null;
let _lastDark = 0, _lastLight = 0;
const COOLDOWN = 2000;

export function setOnMood(fn) { _onMood = fn; }

export function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return false;
  _makeInstance(SR, 'en-US');
  _makeInstance(SR, 'nl-NL');
  return true;
}

function _makeInstance(SR, lang) {
  const r = new SR();
  r.continuous = true; r.interimResults = true; r.lang = lang; r.maxAlternatives = 1;
  r.onresult = _onResult;
  r.onerror = (e) => { if (e.error === 'no-speech' || e.error === 'aborted') return; };
  r.onend = () => { try { r.start(); } catch (_) {} };
  try { r.start(); } catch (_) {}
}

function _onResult(event) {
  const now = performance.now();
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const words = event.results[i][0].transcript.toLowerCase().split(/\s+/);
    for (const raw of words) {
      const w = raw.replace(/[^a-z]/g, '');
      if (!w) continue;
      if (DARK_WORDS.has(w) && now - _lastDark > COOLDOWN) {
        _lastDark = now; if (_onMood) _onMood({ mood: 'dark', word: w }); return;
      }
      if (LIGHT_WORDS.has(w) && now - _lastLight > COOLDOWN) {
        _lastLight = now; if (_onMood) _onMood({ mood: 'light', word: w }); return;
      }
    }
  }
}
