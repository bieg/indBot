// ── DONKER / NEGATIEF ─────────────────────────────────────────────────────────
// Spreek één van deze woorden uit → sterren worden donkerrood/paars, font-weight 900
// EN: dark, storm, pessimistic, critical, negative, gloomy, hate, rage, terror …
// NL: donker, storm, pessimistisch, kritisch, negatief, somber, haat, woede …
const DARK_WORDS = new Set([
  // EN — emotie
  'dark','darkness','dying','die','dead','death','storm','stormy','moody',
  'depression','depressed','sad','sadness','broken','lost','alone','lonely',
  'pain','hurt','hollow','empty','void','shadow','fear','hate','cold','numb',
  'cry','tears','fallen','heavy','chaos','rage','destroy','burn','fade',
  'scream','wound','war','battle','blood','bleed','black','nightmare','ghost',
  'haunted','hopeless','helpless','shattered','bleak','dread','horror',
  'despair','misery','anguish','torment','silence','ruin','trapped','sink',
  'drown','falling','collapse','disturbed','boom','crash','break',
  // EN — pessimisme / kritiek
  'pessimistic','pessimism','critical','criticize','negative','negativity',
  'gloomy','miserable','terrible','awful','horrible','dreadful','disgusting',
  'disgusted','disgust','vile','rotten','toxic','poison','poisoned',
  'corrupt','evil','wicked','cruel','brutal','violent','violence',
  'furious','angry','anger','upset','bitter','resentment','jealous',
  'jealousy','envy','envy','blame','shame','guilty','guilt','worthless',
  'useless','pathetic','failure','failed','fail','wrong','bad','worst','worse',
  'ugly','abuse','abused','suffer','suffering','grief','mourn','mourning',
  'weep','weeping','anxious','anxiety','panic','terror','terrified','scared',
  'paranoid','shameful','loser','disgrace','curse','cursed','damned',
  'condemned','frozen','stuck','trapped','suffocate','suffocating',
  'hopeless','meaningless','pointless','empty','hollow','void',
  'crisis','disaster','catastrophe','apocalypse','destroy','destruction',
  // NL — emotie
  'donker','duisternis','sterven','dood','stormig','somber',
  'depressie','depressief','droevig','verdriet','gebroken','verloren',
  'alleen','eenzaam','pijn','leeg','leegte','schaduw','angst','haat','koud',
  'huilen','tranen','gevallen','zwaar','woede','vernietigen','branden',
  'vervagen','schreeuwen','wond','oorlog','bloed','nacht','nachtmerrie',
  'spook','hopeloos','kapot','wanhoop','ellende','zinken','verdrinken',
  'instorten','verstoord',
  // NL — pessimisme / kritiek
  'pessimistisch','pessimisme','kritisch','kritiseren','negatief','negativiteit',
  'somber','ellendig','verschrikkelijk','afschuwelijk','gruwelijk','walgelijk',
  'walging','giftig','corrupt','kwaad','wreed','brutal','gewelddadig','geweld',
  'woedend','boos','overstuur','bitter','wrok','jaloers','jaloezie','afgunst',
  'schuld','schuldgevoel','schaamte','waardeloos','nutteloos','zielig',
  'mislukking','mislukt','mislukkeling','fout','slecht','lelijk','misbruik',
  'lijden','verdriet','rouwen','treuren','wenen','angstig','paniek',
  'terreur','bang','beschaamd','schande','vervloekt','veroordeeld',
  'bevroren','vastgelopen','zinloos','betekenisloos','leeg','hol',
  'crisis','ramp','catastrofe','chaos','stuk','kapot','brak',
  'duister','duisternis','geen zin','zinloos','nutteloos','hopeloos',
  'neerslachtig','bedrukt','terneergeslagen','mistroostig','zwartgallig',
]);

// ── LICHT / POSITIEF ──────────────────────────────────────────────────────────
// Spreek één van deze woorden uit → sterren worden wit/oranje confetti, font-weight 100
// EN: happy, sunshine, love, magic, awesome, cool, celebrate, dance …
// NL: blij, gezellig, zon, liefde, magisch, geweldig, cool, vieren, dansen …
const LIGHT_WORDS = new Set([
  // EN — emotie & natuur
  'sunshine','sun','sunny','light','happy','happiness','joy','joyful',
  'friends','friend','family','love','loving','hope','hopeful','smile',
  'bright','warm','warmth','bloom','flower','beautiful','beauty','peace',
  'free','freedom','dance','fly','glow','golden','sweet','alive','together',
  'dream','float','gentle','rise','sing','birds','bees','bee','spring',
  'morning','sky','heart','laugh','laughter','grace','magic','wonder',
  'wonderful','amazing','walk','breathe','life','live','touch','sparkle',
  'shine','soft','soar','celebrate','good','great','better','positive',
  // EN — enthousiasme / cool
  'cool','awesome','fantastic','brilliant','perfect','excellent','superb',
  'outstanding','incredible','unbelievable','epic','gorgeous','spectacular',
  'glorious','radiant','delightful','cheerful','merry','festive',
  'grateful','thankful','blessed','lucky','fortunate','inspired','motivated',
  'energetic','powerful','strong','confident','proud','excited','thrilled',
  'ecstatic','elated','exhilarated','playful','funny','hilarious','creative',
  'colorful','vibrant','refreshing','healing','restored','renewed',
  'peaceful','calm','serene','tranquil','cozy','comfortable','safe','secure',
  'embrace','hug','kiss','cuddle','tender','caring','kind','generous',
  'compassionate','connection','unity','harmony','balance','euphoric',
  'blissful','content','satisfied','alive','flourish','thrive','prosper',
  'wow','yes','yay','hurray','hooray','woohoo','whoa','incredible',
  // NL — emotie & natuur
  'zonneschijn','zon','zonnig','blij','blijheid','vreugde',
  'vrienden','vriend','vriendin','familie','liefde','hoop','hoopvol',
  'glimlach','helder','warmte','bloem','mooi','vrede','vrij',
  'vrijheid','dansen','vliegen','gloeien','goud','zoet','levend','samen',
  'droom','dromen','zweven','zacht','zingen','vogels','bijen','lente',
  'ochtend','hemel','hart','lachen','gelach','magisch','magie','geweldig',
  'wandelen','ademen','leven','aanraken','stralen','feest','goed','beter',
  // NL — enthousiasme / cool
  'gezellig','cool','leuk','fijn','lekker','relaxed','chill','fantastisch',
  'briljant','perfect','uitstekend','prachtig','schitterend','heerlijk',
  'vrolijk','feestelijk','dankbaar','gezegend','gelukkig','geïnspireerd',
  'gemotiveerd','energiek','sterk','zelfverzekerd','trots','opgewonden',
  'enthousiast','verrukt','speels','grappig','creatief','kleurrijk',
  'levendig','verfrissend','helend','hersteld','hernieuwd','kalm',
  'sereen','rustig','knus','comfortabel','veilig','omhelzing','omarmen',
  'teder','zorgzaam','vriendelijk','gul','medelevend','verbinding',
  'eenheid','harmonie','balans','zalig','tevreden','floreren','gedijen',
  'gezelligheid','plezier','pret','genieten','heerlijk','schitterend',
  'wauw','ja','jij','joepie','hoera','yes','super','top','tof',
]);

let _onMood = null;
let _lastDark = 0, _lastLight = 0;
const COOLDOWN = 2000;

export function setOnMood(fn) { _onMood = fn; }

export function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    console.warn('[speech] niet beschikbaar — gebruik Chrome/Edge');
    return false;
  }
  _start(SR, 'en-US');
  _start(SR, 'nl-NL');
  return true;
}

function _start(SR, lang) {
  let delay = 2000;
  let stopped = false;

  function run() {
    if (stopped) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = lang;
    r.maxAlternatives = 1;
    r.onresult = _onResult;
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
        console.warn('[speech] gestopt (' + lang + '):', e.error);
        stopped = true;
        return;
      }
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('[speech] fout (' + lang + '):', e.error);
        delay = Math.min(delay * 2, 30000);
      }
    };
    r.onend = () => {
      if (!stopped) setTimeout(run, delay);
    };
    try { r.start(); delay = 2000; } catch (_) {}
  }

  run();
}

function _onResult(event) {
  const now = performance.now();
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const transcript = event.results[i][0].transcript.toLowerCase();
    if (event.results[i].isFinal) console.log('[speech]', transcript);
    const words = transcript.split(/\s+/);
    for (const raw of words) {
      const w = raw.replace(/[^a-z]/g, '');
      if (!w) continue;
      if (DARK_WORDS.has(w) && now - _lastDark > COOLDOWN) {
        console.log('[speech] DONKER:', w);
        _lastDark = now; if (_onMood) _onMood({ mood: 'dark', word: w }); return;
      }
      if (LIGHT_WORDS.has(w) && now - _lastLight > COOLDOWN) {
        console.log('[speech] LICHT:', w);
        _lastLight = now; if (_onMood) _onMood({ mood: 'light', word: w }); return;
      }
    }
  }
}
