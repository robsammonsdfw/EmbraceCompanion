// ============================================================================
// The walkthroughs for the Companion's run screens. Ids and wording are
// iStride's (TempoRun helper/guides/running.ts and goExercise.ts) wherever the
// task is the same, with only the live part: picking the activity and setup
// happen in iStride, which walks through those itself. Wording differs only
// where the phone app differs (it tracks with the phone locked; Stop returns
// to iStride).
// ============================================================================

export type ScreenId =
  | 'start' | 'live.run' | 'live.academy' | 'live.trail' | 'live.track' | 'live.casual'
  | 'live.hiit' | 'live.ride' | 'live.walk' | 'live.heartwalk';

export interface Step {
  id: string;
  /** tap: "Now tap here", moves on when the control is tapped. info: a card with Next. */
  kind: 'tap' | 'info';
  anchor?: string;
  title: string;
  body?: string;
  /** banner: the card is pinned to the top and a ring marks the control. */
  placement?: 'auto' | 'banner';
  nextLabel?: string;
  alsoAllow?: string[];
  skipWhenVisible?: string[];
  /** The control isn't on screen yet (Stop shows only when paused): wait for it, showing nothing meanwhile. */
  waitForAnchor?: boolean;
}

export interface Guide {
  id: string;
  title: string;
  summary: string;
  doneMessage: string;
  screens: ScreenId[];
  steps: Step[];
  availableWhen?: { anchor: string; otherwise: string };
  /** Starts by itself the first time its screen shows with Helper Mode on. */
  auto?: boolean;
  /** Listed under "What can I do here?". Default true. */
  listed?: boolean;
}

const RUN: ScreenId[] = ['live.run', 'live.academy', 'live.trail', 'live.track'];
const EXERCISE: ScreenId[] = ['live.hiit', 'live.ride', 'live.walk', 'live.heartwalk'];
const ALL: ScreenId[] = [...RUN, 'live.casual', ...EXERCISE];

const keepGoing = (body = 'When you finish, tap Pause, then Stop. Your report opens in iStride.'): Step => ({
  id: 'keep-going', kind: 'info', anchor: 'runs.live.stats', title: 'Keep going', body, placement: 'banner', nextLabel: 'Got it',
});

/** The first time on a live screen: what's on, and the two taps that end it. */
const firstRun = (id: string, what: string, screens: ScreenId[]): Guide => ({
  id, title: `Your first ${what} in the Companion`, summary: 'What the screen shows, and how to finish.', listed: false, auto: true, screens,
  doneMessage: `Saved. Your report is opening in iStride.`,
  steps: [
    { id: 'live', kind: 'info', anchor: 'runs.live.stats', title: `Your ${what} is on`,
      body: 'Time, distance and GPS signal are up here; scroll down for the rest. You can lock your phone: tracking and the coach carry on.', nextLabel: 'Got it' },
    { id: 'pause', kind: 'info', anchor: 'runs.live.pause', title: 'When you finish, tap Pause',
      body: 'Stop shows once you’re paused. Tap ✕ on these notes any time to turn them off.', nextLabel: 'Got it', skipWhenVisible: ['runs.live.stop'] },
    { id: 'stop', kind: 'tap', anchor: 'runs.live.stop', waitForAnchor: true, title: 'Now tap Stop to finish',
      body: `It saves your ${what} and takes you straight to its report in iStride. Resume carries on instead.` },
  ],
});

export const GUIDES: Guide[] = [
  {
    id: 'companion.run.start', title: 'Start from the Companion', summary: 'Start tracking with what you chose in iStride.', listed: false, auto: true,
    screens: ['start'], doneMessage: '',
    steps: [
      { id: 'start', kind: 'tap', anchor: 'companion.start', title: 'Now tap START',
        body: 'What you chose in iStride came with you. The Companion keeps tracking with your phone locked.', skipWhenVisible: ['companion.permission'] },
      { id: 'allow', kind: 'tap', anchor: 'companion.permission', waitForAnchor: true, title: 'Now tap Continue',
        body: 'Your phone asks next. Choose Allow, so your route can be tracked with the screen off.' },
    ],
  },
  firstRun('companion.run.live', 'run', [...RUN, 'live.casual']),
  firstRun('companion.exercise.live', 'workout', EXERCISE),

  {
    id: 'runs.live.pause', title: 'Pause and carry on', summary: 'Pause for a break, then pick up where you left off.',
    screens: ALL, doneMessage: 'Back on the clock — tap Pause, then Stop when you’re done.',
    steps: [
      { id: 'pause', kind: 'tap', anchor: 'runs.live.pause', title: 'Now tap Pause', body: 'The clock stops and paused time isn’t counted.', skipWhenVisible: ['runs.live.stop'] },
      { id: 'stop-info', kind: 'info', anchor: 'runs.live.stats', title: 'You’re paused',
        body: 'Stop, beside Resume, ends it and saves it, then opens your report in iStride. It’s only there while you’re paused.', placement: 'banner' },
      { id: 'play', kind: 'tap', anchor: 'runs.live.pause', title: 'Now tap Resume', body: 'It carries on from where you paused.', alsoAllow: ['runs.live.stop'] },
    ],
  },
  {
    id: 'runs.live.read', title: 'Read the run screen', summary: 'What every number on the run screen means, top to bottom.',
    screens: RUN, doneMessage: 'That’s your run screen — tap Pause, then Stop when you finish.',
    steps: [
      { id: 'stats', kind: 'info', anchor: 'runs.live.stats', title: 'Time, calories and distance', body: 'The pill shows your GPS signal; green is good. Calories need your weight on iStride’s setup screen.' },
      { id: 'pace', kind: 'info', anchor: 'runs.live.paceTiles', title: 'Now vs target',
        body: 'PACE is how fast you’re going now, FINISH when you’d finish at this speed — orange means you’re behind your target. AVG PACE is the whole run so far.', placement: 'banner' },
      { id: 'academy', kind: 'info', anchor: 'runs.live.academy', title: 'Your Academy drill',
        body: 'The drill you’re on, its countdown and form focus, what’s next and the time left. The coach calls every change.', placement: 'banner' },
      { id: 'trail', kind: 'info', anchor: 'runs.live.trail', title: 'Your climb',
        body: 'Elevation gained, your altitude, the grade you’re on, and GAP — your pace as if the ground were flat.', placement: 'banner' },
      { id: 'map', kind: 'info', anchor: 'runs.live.map', title: 'Your map',
        body: 'The solid line is where you’ve run; a dashed line is a loaded route. Tap EXPAND for a full-screen map.', placement: 'banner' },
      { id: 'hr', kind: 'info', anchor: 'runs.live.hr', title: 'Your heart rate',
        body: 'The pulse you last entered, for two minutes; otherwise the reading you took before you started.', placement: 'banner' },
      { id: 'spm', kind: 'info', anchor: 'runs.live.spm', title: 'Your cadence', body: 'Steps a minute over the last 20 seconds, from the phone’s motion sensor.', placement: 'banner' },
      keepGoing(),
    ],
  },
  {
    id: 'runs.live.target', title: 'Change your target mid-run', summary: 'Speed up or ease off your target, and set or change how far you’re going.',
    screens: [...RUN, 'live.ride', 'live.walk'], doneMessage: 'Targets updated — the coach and your finish time follow them.',
    steps: [
      { id: 'speed', kind: 'tap', anchor: 'runs.live.targetSpeed', title: 'Now tap ▲ or ▼',
        body: 'The left arrows move your target speed by 1, the right ones by 0.1. No target yet? The first tap sets one at your speed now.', placement: 'banner' },
      { id: 'distance', kind: 'tap', anchor: 'runs.live.targetDistance', title: 'Now tap ▲ or ▼ by your distance',
        body: 'Change how far you’re going by 1 or 0.1. On an open run the first tap sets a target.', placement: 'banner' },
      { id: 'clear', kind: 'info', anchor: 'runs.live.targetDistance', title: 'Your target distance',
        body: 'The bar fills as you go. Clear target takes it away again.', placement: 'banner', nextLabel: 'Got it' },
    ],
  },
  {
    id: 'runs.live.fuel', title: 'Log a gel or a drink mid-run', summary: 'Keep the fuel and fluid gauges honest when you eat or drink on the go.',
    screens: [...RUN, 'live.hiit', 'live.ride', 'live.walk'], doneMessage: 'Logged — your fuel and fluid gauges include it.',
    steps: [
      { id: 'fuel', kind: 'info', anchor: 'runs.live.fuel', title: 'This is your fuel gauge',
        body: 'Energy you have left: meals logged in EmbraceHealthAI plus your pre-run fuel check, less what you burn. All estimates.', placement: 'banner' },
      { id: 'gel', kind: 'tap', anchor: 'runs.live.gel', title: 'Now tap + GEL', body: 'Each tap adds one gel, about 100 kcal.', placement: 'banner' },
      { id: 'fluid', kind: 'info', anchor: 'runs.live.fluid', title: 'This is your fluid gauge', body: 'Estimated sweat lost so far, from your weight and effort.', placement: 'banner' },
      { id: 'sip', kind: 'tap', anchor: 'runs.live.sip', title: 'Now tap + SIP', body: 'Tap it each time you drink; each tap logs about 150 mL.', placement: 'banner' },
    ],
  },
  {
    id: 'runs.live.map', title: 'See your map full screen', summary: 'Open the live map full screen and close it again.',
    screens: [...RUN, ...EXERCISE], doneMessage: 'Map closed — back to your run.',
    steps: [
      { id: 'show', kind: 'tap', anchor: 'exercise.live.mapToggle', title: 'Now tap SHOW MAP', body: 'Your map opens under the button.', placement: 'banner',
        skipWhenVisible: ['runs.live.mapExpand', 'runs.live.mapClose'] },
      { id: 'expand', kind: 'tap', anchor: 'runs.live.mapExpand', title: 'Now tap EXPAND', body: 'The line is where you’ve been, the blue dot is you. The map fills the screen.', placement: 'banner' },
      { id: 'close', kind: 'tap', anchor: 'runs.live.mapClose', waitForAnchor: true, title: 'Now tap CLOSE', body: 'Closing it brings back the rest of your run screen.', placement: 'banner' },
    ],
  },
  {
    id: 'companion.live.song', title: 'Pace to your music', summary: 'Tap along to the song and your target pace follows its beat.',
    screens: RUN, doneMessage: 'Target pace set to the song.',
    steps: [
      { id: 'tap', kind: 'tap', anchor: 'runs.live.song', title: 'Now tap the beat',
        body: 'Tap the button on each beat of the song, 8 times. Your target pace changes so each step lands on the beat.', placement: 'banner' },
    ],
  },
  {
    id: 'runs.live.academy', title: 'Do an Academy session', summary: 'A coached 25 minutes: warm-up, six form strides and a cool-down.',
    screens: ['live.academy'], doneMessage: 'Academy on — the coach calls every drill.',
    steps: [
      { id: 'drill', kind: 'info', anchor: 'runs.live.academy', title: 'Your drill',
        body: 'The part you’re on with its countdown and form focus, what’s next and the time left. Turn your sound up to hear the coach.', placement: 'banner' },
      keepGoing('Run each stride strong and controlled, then jog easy. When you finish, tap Pause, then Stop.'),
    ],
  },
  {
    id: 'runs.live.trail', title: 'Run a trail', summary: 'Elevation, altitude, grade and grade-adjusted pace for hilly runs.',
    screens: ['live.trail'], doneMessage: 'Trail run on — watch your climb add up.',
    steps: [
      { id: 'climb', kind: 'info', anchor: 'runs.live.trail', title: 'Your climb',
        body: 'ELEV GAIN is how far you’ve climbed, GRADE how steep it is now, and GAP your pace as if the ground were flat.', placement: 'banner' },
      keepGoing(),
    ],
  },
  {
    id: 'runs.live.casual', title: 'Burn calories in Casual mode', summary: 'A relaxed session with a big calorie counter.',
    screens: ['live.casual'], doneMessage: 'Casual run on — go at whatever pace feels good.',
    steps: [
      { id: 'calories', kind: 'info', anchor: 'runs.live.casual', title: 'Your calories', body: 'The big number is calories burned, with your time and distance underneath.', placement: 'banner' },
      keepGoing(),
    ],
  },
  {
    id: 'runs.live.weather', title: 'Check your route’s weather mid-run', summary: 'Open the wind and weather you checked for your route.',
    screens: [...RUN, 'live.ride', 'live.walk'], doneMessage: 'Weather closed — back to your run.',
    availableWhen: { anchor: 'runs.live.weather', otherwise: 'Check a route’s weather in iStride’s Maps first — then this shows you how.' },
    steps: [
      { id: 'open', kind: 'tap', anchor: 'runs.live.weather', title: 'Now tap WEATHER', body: 'It opens the forecast you checked for this route.', placement: 'banner' },
      { id: 'panel', kind: 'info', anchor: 'runs.live.weatherPanel', waitForAnchor: true, title: 'Your route’s weather', body: 'Wind and temperature along your route, from when you checked it.', placement: 'banner' },
      { id: 'close', kind: 'tap', anchor: 'runs.live.weatherClose', title: 'Now tap CLOSE', body: 'Back to your run.', placement: 'banner' },
    ],
  },
  {
    id: 'runs.live.offroute', title: 'Get back on your route', summary: 'When you leave your route, get a new way to the finish.',
    screens: [...RUN, 'live.ride', 'live.walk'], doneMessage: 'Finding your way back — follow the new route on your map.',
    availableWhen: { anchor: 'runs.live.offRoute', otherwise: 'This shows when you leave a loaded route.' },
    steps: [
      { id: 'banner', kind: 'info', anchor: 'runs.live.offRoute', title: 'You’re off your route',
        body: 'Tap REROUTE for a new route from here to your finish, or DISMISS to carry on your own way.', placement: 'banner' },
      { id: 'reroute', kind: 'tap', anchor: 'runs.live.reroute', title: 'Now tap REROUTE', body: 'The new route shows on your map.', placement: 'banner' },
    ],
  },
  {
    id: 'exercise.hiit.live', title: 'Do a HIIT workout', summary: 'Follow the intervals, and add or drop rounds as you go.',
    screens: ['live.hiit'], doneMessage: 'Intervals on — the coach calls every sprint.',
    steps: [
      { id: 'card', kind: 'info', anchor: 'exercise.live.hiitCard', title: 'Your interval',
        body: 'Warm-up, sprint or recovery, with its countdown and what’s next. The coach beeps 3-2-1 into every sprint.', placement: 'banner' },
      { id: 'tiles', kind: 'info', anchor: 'exercise.live.tiles', title: 'Speed and sprints',
        body: 'Your speed now, this sprint’s top speed (or your best), sprints done and calories.', placement: 'banner' },
      keepGoing(),
    ],
  },
  {
    id: 'exercise.hiit.manual', title: 'Run intervals at your own pace', summary: 'Tap to switch: start each sprint and recovery yourself, no timer.',
    screens: ['live.hiit'], doneMessage: 'Sprint, recover, repeat — every interval is logged.',
    availableWhen: { anchor: 'exercise.live.sprint', otherwise: 'Choose the Tap to switch workout on iStride’s HIIT setup first.' },
    steps: [
      { id: 'sprint', kind: 'tap', anchor: 'exercise.live.sprint', title: 'Now tap START SPRINT', body: 'Go all out. The coach calls it and the sprint is timed.', placement: 'banner' },
      { id: 'recover', kind: 'tap', anchor: 'exercise.live.sprint', title: 'Now tap START WALK',
        body: 'When you’ve had enough (it says START JOG if you chose jog). Tap again for your next sprint.', placement: 'banner' },
    ],
  },
  {
    id: 'exercise.ride', title: 'Go for a ride', summary: 'Set a target speed, then ride with speed, climbing and your finish time in view.',
    screens: ['live.ride'], doneMessage: 'Ride on — tap Pause, then Stop when you’re home.',
    steps: [
      { id: 'speed', kind: 'tap', anchor: 'runs.live.targetSpeed', title: 'Now tap ▲ or ▼', body: 'Change your target as you ride: left arrows by 1, right by 0.1.', placement: 'banner' },
      { id: 'tiles', kind: 'info', anchor: 'exercise.live.speed', title: 'Avg, Top and Finish',
        body: 'Your average and top speed, and when you’d finish at this speed against your target. Orange means behind.', placement: 'banner' },
      { id: 'more', kind: 'info', anchor: 'exercise.live.tiles', title: 'Climb, grade, calories, heart', body: 'Calories come from your speed and the hills.', placement: 'banner' },
      { id: 'screen', kind: 'info', anchor: 'companion.screenOn', title: 'Big numbers on your handlebars',
        body: 'This switch keeps the screen on and shows only speed, distance and time. It’s on for rides; tracking doesn’t depend on it.', placement: 'banner' },
      keepGoing(),
    ],
  },
  {
    id: 'exercise.walk', title: 'Go for a walk', summary: 'Steps, cadence, pace and distance, with the same targets and coach as a run.',
    screens: ['live.walk'], doneMessage: 'Walk on — tap Pause, then Stop when you’re done.',
    steps: [
      { id: 'tiles', kind: 'info', anchor: 'exercise.live.speed', title: 'Pace, steps and finish',
        body: 'Your pace now against your target, steps and cadence from the phone’s motion sensor, and your finish time.', placement: 'banner' },
      { id: 'more', kind: 'info', anchor: 'exercise.live.tiles', title: 'Average pace, climb, calories, heart', body: 'Calories come from your speed and any uphill.', placement: 'banner' },
      keepGoing(),
    ],
  },
  {
    id: 'exercise.heartwalk.live', title: 'Walk in your heart-rate zone', summary: 'Watch the zones and stay in your target zone.',
    screens: ['live.heartwalk'], doneMessage: 'Hold your zone — the coach tells you if you drift.',
    steps: [
      { id: 'dial', kind: 'info', anchor: 'exercise.live.zone', title: 'Your heart rate and zone',
        body: 'The lit bar is the zone you’re in; your target zone is outlined. The line under it says whether you’re in it, too hard or too easy.', placement: 'banner' },
      { id: 'source', kind: 'info', anchor: 'exercise.live.hrSource', title: 'Where your heart rate comes from',
        body: 'For now, the pulse you type in from your watch or count yourself. It counts for the next two minutes.', placement: 'banner' },
      { id: 'tiles', kind: 'info', anchor: 'exercise.live.tiles', title: 'Time in zone, pace, steps, calories',
        body: 'Time in zone needs a live monitor; an entered pulse shows your zone but can’t time it.', placement: 'banner' },
      keepGoing(),
    ],
  },
  {
    id: 'exercise.hr.live', title: 'Add your heart rate mid-workout', summary: 'Enter the number your watch shows.',
    screens: ALL.filter((s) => s !== 'live.casual'), doneMessage: 'Heart rate in — your zone uses it.',
    steps: [
      { id: 'check', kind: 'tap', anchor: 'exercise.live.hrSource', title: 'Now tap ENTER YOUR PULSE', body: 'Use the number your watch shows, or count your pulse for 15 seconds and multiply by 4.', placement: 'banner',
        skipWhenVisible: ['exercise.live.hrSet'] },
      { id: 'set', kind: 'tap', anchor: 'exercise.live.hrSet', waitForAnchor: true, title: 'Set it, then tap SAVE',
        body: 'Use − and + to reach your heart rate in beats a minute. It counts as your heart rate for the next two minutes.', placement: 'banner' },
    ],
  },
];
