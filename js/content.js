// Lesson content. English text lives in i18n/en.json ("phrases"); this file
// holds structure: which stage a phrase belongs to and which visual shows it.

export const STAGES = [
  { id: 'car',  icon: 'car' },
  { id: 'dir',  icon: 'turnLeft' },
  { id: 'lane', icon: 'laneLeft' },
  { id: 'park', icon: 'parkSpace' },
  { id: 'talk', icon: 'talk' },
  { id: 'res',  icon: 'flag' },
  { id: 'exam', icon: 'exam', exam: true },
];

// visual: key into visuals.js (scene:* = animated road scene, icon:* = car control)
export const PHRASES = [
  { id: 'car.window',       stage: 'car',  visual: 'icon:window' },
  { id: 'car.armLeft',      stage: 'car',  visual: 'arm:left' },
  { id: 'car.armRight',     stage: 'car',  visual: 'arm:right' },
  { id: 'car.armStop',      stage: 'car',  visual: 'arm:stop' },
  { id: 'car.key',          stage: 'car',  visual: 'icon:key' },
  { id: 'car.signalLeft',   stage: 'car',  visual: 'icon:signalLeft' },
  { id: 'car.signalRight',  stage: 'car',  visual: 'icon:signalRight' },
  { id: 'car.brake',        stage: 'car',  visual: 'icon:brake' },
  { id: 'car.horn',         stage: 'car',  visual: 'icon:horn' },
  { id: 'car.parkingBrake', stage: 'car',  visual: 'icon:parkingBrake' },
  { id: 'car.flashers',     stage: 'car',  visual: 'icon:flashers' },
  { id: 'car.headlights',   stage: 'car',  visual: 'icon:headlights' },
  { id: 'car.wipers',       stage: 'car',  visual: 'icon:wipers' },
  { id: 'car.defroster',    stage: 'car',  visual: 'icon:defroster' },
  { id: 'car.auto',         stage: 'car',  visual: 'icon:auto' },

  { id: 'dir.cornerLeft',   stage: 'dir',  visual: 'scene:turnLeft' },
  { id: 'dir.cornerRight',  stage: 'dir',  visual: 'scene:turnRight' },
  { id: 'dir.lightLeft',    stage: 'dir',  visual: 'scene:turnLeft' },
  { id: 'dir.lightRight',   stage: 'dir',  visual: 'scene:turnRight' },
  { id: 'dir.stopRight',    stage: 'dir',  visual: 'scene:turnRight' },
  { id: 'dir.straight',     stage: 'dir',  visual: 'scene:straight' },
  { id: 'dir.follow',       stage: 'dir',  visual: 'scene:straight' },
  { id: 'dir.makeLeft',     stage: 'dir',  visual: 'scene:turnLeft' },
  { id: 'dir.nextLeft',     stage: 'dir',  visual: 'scene:turnLeft' },
  { id: 'dir.makeRight',    stage: 'dir',  visual: 'scene:turnRight' },
  { id: 'dir.nextRight',    stage: 'dir',  visual: 'scene:turnRight' },
  { id: 'dir.stopLeft',     stage: 'dir',  visual: 'scene:turnLeft' },
  { id: 'dir.goStraight',   stage: 'dir',  visual: 'scene:straight' },

  { id: 'lane.left',        stage: 'lane', visual: 'scene:laneLeft' },
  { id: 'lane.right',       stage: 'lane', visual: 'scene:laneRight' },
  { id: 'lane.necessary',   stage: 'lane', visual: null },
  { id: 'lane.pullOver',    stage: 'lane', visual: 'scene:pullOver' },
  { id: 'lane.curb',        stage: 'lane', visual: 'scene:pullOver' },
  { id: 'lane.back',        stage: 'lane', visual: 'scene:merge' },
  { id: 'lane.safe',        stage: 'lane', visual: null },
  { id: 'lane.moveLeft',    stage: 'lane', visual: 'scene:laneLeft' },
  { id: 'lane.moveRight',   stage: 'lane', visual: 'scene:laneRight' },
  { id: 'lane.pullAway',    stage: 'lane', visual: 'scene:merge' },

  { id: 'park.backUp',      stage: 'park', visual: 'scene:backUp' },
  { id: 'park.keepGoing',   stage: 'park', visual: null },
  { id: 'park.okStop',      stage: 'park', visual: 'scene:stop' },
  { id: 'park.right',       stage: 'park', visual: 'scene:pullOver' },
  { id: 'park.lot',         stage: 'park', visual: 'scene:parkLot' },
  { id: 'park.space',       stage: 'park', visual: 'scene:parkSpace' },
  { id: 'park.inPark',      stage: 'park', visual: 'icon:gearPark' },
  { id: 'park.engineOff',   stage: 'park', visual: 'icon:engineOff' },
  { id: 'park.dmv',         stage: 'park', visual: null },
  { id: 'park.backSlow',    stage: 'park', visual: 'scene:backUp' },
  { id: 'park.stopHere',    stage: 'park', visual: 'scene:stop' },
  { id: 'park.drive',       stage: 'park', visual: 'icon:gearDrive' },

  { id: 'talk.evaluated',   stage: 'talk', visual: null },
  { id: 'talk.trick',       stage: 'talk', visual: null },
  { id: 'talk.questions',   stage: 'talk', visual: null },
  { id: 'talk.seatbelt',    stage: 'talk', visual: 'icon:seatbelt' },
  { id: 'talk.noAuto',      stage: 'talk', visual: 'icon:auto' },
  { id: 'talk.repeat',      stage: 'talk', visual: null, learnerSays: true },

  { id: 'res.blindSpot',    stage: 'res',  visual: null },
  { id: 'res.bothWays',     stage: 'res',  visual: null },
  { id: 'res.tooFast',      stage: 'res',  visual: null },
  { id: 'res.tooSlow',      stage: 'res',  visual: null },
  { id: 'res.stops',        stage: 'res',  visual: null },
  { id: 'res.practice',     stage: 'res',  visual: null },
  { id: 'res.pass',         stage: 'res',  visual: null },
  { id: 'res.fail',         stage: 'res',  visual: null },

  // examiner lines used only in the drive test
  { id: 'sys.begin',        stage: 'sys',  visual: null },
  { id: 'sys.okay',         stage: 'sys',  visual: null },
  { id: 'sys.keepGoing',    stage: 'sys',  visual: null },
  { id: 'sys.done',         stage: 'sys',  visual: null },
];

export const VOICES = ['w1', 'w2', 'm1', 'm2'];

export const LESSON_CHUNK = 5;   // new phrases per lesson
export const EXAM_LENGTH = 20;   // commands in the mock exam
export const EXAM_PASS = 0.85;   // share of commands needed to pass

export function phrasesOf(stageId) {
  return PHRASES.filter((p) => p.stage === stageId);
}

// Lessons per stage: chunks of new phrases, then one mixed review.
export function lessonsOf(stageId) {
  const list = phrasesOf(stageId);
  const chunks = [];
  for (let i = 0; i < list.length; i += LESSON_CHUNK) chunks.push(list.slice(i, i + LESSON_CHUNK).map((p) => p.id));
  // fold a tiny last chunk into the previous one
  if (chunks.length > 1 && chunks[chunks.length - 1].length < 3) {
    const last = chunks.pop();
    chunks[chunks.length - 1].push(...last);
  }
  return [...chunks.map((ids) => ({ kind: 'learn', ids })), { kind: 'review', ids: list.map((p) => p.id) }];
}

export const LANGUAGES = [
  { code: 'es', nativeName: 'Español', name: 'Spanish' },
  { code: 'zh-Hans', nativeName: '简体中文', name: 'Chinese (Simplified)' },
  { code: 'zh-Hant', nativeName: '繁體中文', name: 'Chinese (Traditional)' },
  { code: 'vi', nativeName: 'Tiếng Việt', name: 'Vietnamese' },
  { code: 'ko', nativeName: '한국어', name: 'Korean' },
  { code: 'tl', nativeName: 'Tagalog', name: 'Tagalog' },
  { code: 'ru', nativeName: 'Русский', name: 'Russian' },
  { code: 'hy', nativeName: 'Հայերեն', name: 'Armenian' },
  { code: 'pa', nativeName: 'ਪੰਜਾਬੀ', name: 'Punjabi' },
  { code: 'hi', nativeName: 'हिन्दी', name: 'Hindi' },
  { code: 'ar', nativeName: 'العربية', name: 'Arabic', rtl: true },
  { code: 'fa', nativeName: 'فارسی', name: 'Persian', rtl: true },
  { code: 'pt', nativeName: 'Português', name: 'Portuguese' },
  { code: 'en', nativeName: 'English', name: 'English' },
];

// Web fonts for scripts the main typeface doesn't cover.
export const SCRIPT_FONTS = {
  'zh-Hans': 'Noto Sans SC',
  'zh-Hant': 'Noto Sans TC',
  ko: 'Noto Sans KR',
  hy: 'Noto Sans Armenian',
  pa: 'Noto Sans Gurmukhi',
  hi: 'Noto Sans Devanagari',
  ar: 'Noto Sans Arabic',
  fa: 'Vazirmatn',
  vi: 'Be Vietnam Pro',
};
