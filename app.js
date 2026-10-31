// ===== 設定 =====
const SEAT_COUNT = 17;
const OPEN_MINUTES = 9 * 60;
const CLOSE_MINUTES = 21 * 60;
const BAR_TOTAL_MINUTES = 6 * 60; // タイムラインのバー1本で表す時間（09〜15時 / 15〜21時）
const USE_MINUTES = 2 * 60; // 利用・予約・延長は、どれも1回2時間
const STORAGE_KEY = 'lc-seat-checker-schedules';

// スマホは表示のみ。CSS がスマホ用の見た目に切り替えられるよう、<html> に印を付ける
const isMobile = /iPhone|iPad|Android/.test(navigator.userAgent);
if (isMobile) document.documentElement.classList.add('is-mobile');

// テスト用：URL の末尾で表示を切り替える（例：index.html?check=full&time=15:00）
//   check=full … 満席にする / check=free … 空席がある初期データにする
//   time=HH:MM … 現在時刻をその時刻として扱う（2桁で書く。例：09:00）
// どれかが付いているときは確認用の表示なので、登録しても localStorage に保存しない
const urlParams = new URLSearchParams(location.search);
const checkMode = urlParams.get('check');
const checkTime = urlParams.get('time');
const isCheckMode = checkMode === 'full' || checkMode === 'free' || checkTime !== null;

// ===== 座席データ =====
// 1席ごとに、予約・利用の時間帯（開館日の 0:00 からの分）を持つ
const initialSeatSchedules = [
  { id: 1, intervals: [{ state: 'reserved', start: 9 * 60, end: 11 * 60 }] },
  { id: 2, intervals: [{ state: 'in-use', start: 9 * 60, end: 11 * 60 }] },
  { id: 3, intervals: [{ state: 'reserved', start: 11 * 60, end: 13 * 60 }] },
  { id: 4, intervals: [{ state: 'in-use', start: 13 * 60, end: 15 * 60 }] },
  { id: 5, intervals: [{ state: 'reserved', start: 15 * 60, end: 17 * 60 }] },
  { id: 6, intervals: [{ state: 'in-use', start: 11 * 60, end: 13 * 60 }] },
  { id: 7, intervals: [{ state: 'reserved', start: 15 * 60, end: 17 * 60 }] },
  { id: 8, intervals: [] },
  { id: 9, intervals: [{ state: 'reserved', start: 9 * 60, end: 11 * 60 }] },
  { id: 10, intervals: [{ state: 'in-use', start: 17 * 60, end: 19 * 60 }] },
  { id: 11, intervals: [] },
  { id: 12, intervals: [{ state: 'reserved', start: 9 * 60, end: 11 * 60 }] },
  { id: 13, intervals: [{ state: 'in-use', start: 13 * 60, end: 15 * 60 }] },
  { id: 14, intervals: [] },
  { id: 15, intervals: [{ state: 'reserved', start: 15 * 60, end: 17 * 60 }] },
  { id: 16, intervals: [{ state: 'in-use', start: 17 * 60, end: 19 * 60 }] },
  { id: 17, intervals: [{ state: 'reserved', start: 9 * 60, end: 11 * 60 }] },
];

function isValidSchedule(data) {
  return Array.isArray(data)
    && data.length === SEAT_COUNT
    && data.every((seat, index) => (
      seat
      && seat.id === index + 1
      && Array.isArray(seat.intervals)
      && seat.intervals.every((interval) => (
        interval
        && (interval.state === 'reserved' || interval.state === 'in-use')
        && Number.isFinite(interval.start)
        && Number.isFinite(interval.end)
        && interval.start >= OPEN_MINUTES
        && interval.end <= CLOSE_MINUTES
        && interval.start < interval.end
      ))
    ));
}

function loadSeatSchedules() {
  // 満席・空席の確認では、保存されたデータではなく初期データから始める
  if (checkMode === 'full' || checkMode === 'free') return initialSeatSchedules;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return initialSeatSchedules;

    const parsed = JSON.parse(saved);
    if (isValidSchedule(parsed)) return parsed;
    console.error('保存された座席スケジュールの形式が正しくありません。初期データを使用します。');
  } catch (error) {
    console.error('保存された座席スケジュールを読み込めませんでした。', error);
  }
  return initialSeatSchedules;
}

const seatSchedules = loadSeatSchedules();
let selectedSeatId = null;
let completionTimeoutId = null;

function saveSeatSchedules() {
  // 確認用の表示では、本物のデータを上書きしないよう保存しない
  if (isCheckMode) return true;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seatSchedules));
    return true;
  } catch (error) {
    console.error('座席スケジュールを保存できませんでした。', error);
    showMessage('登録内容を保存できませんでした。');
    return false;
  }
}

function getSchedule(seatId) {
  return seatSchedules.find((seat) => seat.id === seatId);
}

// ===== 時刻 =====
function parseTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function formatMinutes(minutes) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
  const minute = String(minutes % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

// 日本時間の今を、0:00 からの分で返す（URL で time が指定されていれば、その時刻）
function getCurrentMinutes() {
  const checkMinutes = checkTime === null ? null : parseTime(checkTime);
  if (checkMinutes !== null) return checkMinutes;

  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const japanNow = new Date(utcTime + 9 * 60 * 60 * 1000);
  return japanNow.getHours() * 60 + japanNow.getMinutes();
}

// ===== 座席の状態 =====
// 予約は、開始時刻になったら使用中として扱う
function getEffectiveState(interval, nowMinutes) {
  if (interval.state === 'reserved' && nowMinutes >= interval.start) return 'in-use';
  return interval.state;
}

function getActiveInterval(seat, nowMinutes) {
  return seat.intervals.find((interval) => (
    nowMinutes >= interval.start
    && nowMinutes < interval.end
    && getEffectiveState(interval, nowMinutes) === 'in-use'
  ));
}

// その席が次に空く時刻（分）を返す。今日はもう空かないなら null
function getNextFreeMinutes(seat, nowMinutes) {
  let time = nowMinutes;
  let covering = seat.intervals.find((interval) => interval.start <= time && time < interval.end);
  while (covering) {
    time = covering.end;
    covering = seat.intervals.find((interval) => interval.start <= time && time < interval.end);
  }
  return time < CLOSE_MINUTES ? time : null;
}

function intervalsOverlap(seat, start, end, ignoredInterval = null) {
  return seat.intervals.some((interval) => (
    interval !== ignoredInterval
    && start < interval.end
    && end > interval.start
  ));
}

// ===== 画面の更新 =====
function updateClock(nowMinutes) {
  const timeEl = document.getElementById('time');
  if (timeEl) timeEl.textContent = formatMinutes(nowMinutes);
}

function updateSeatStates(nowMinutes) {
  seatSchedules.forEach((seat) => {
    const seatEl = document.getElementById(`seat${seat.id}`);
    if (!seatEl) return;

    seatEl.classList.remove('free', 'reserved', 'in-use');
    seatEl.classList.add(getActiveInterval(seat, nowMinutes) ? 'in-use' : 'free');
  });
}

function addSegment(barTrack, start, end, barStartMinutes, className) {
  const segment = document.createElement('div');
  segment.className = `segment ${className}`;
  segment.style.left = `${((start - barStartMinutes) / BAR_TOTAL_MINUTES) * 100}%`;
  segment.style.width = `${((end - start) / BAR_TOTAL_MINUTES) * 100}%`;
  barTrack.appendChild(segment);
}

// バー1本に、過ぎた時間（灰色）と、これからの予約・利用を描く
function updateTimelineBar(seat, bar, nowMinutes) {
  const barTrack = bar.querySelector('.bar-track');
  if (!barTrack) return;
  barTrack.querySelectorAll('.segment').forEach((segment) => segment.remove());

  const barStartMinutes = Number(bar.dataset.startHour) * 60;
  const barEndMinutes = barStartMinutes + BAR_TOTAL_MINUTES;
  const pastEnd = Math.min(nowMinutes, barEndMinutes);
  if (pastEnd > barStartMinutes) {
    addSegment(barTrack, barStartMinutes, pastEnd, barStartMinutes, 'past');
  }

  seat.intervals.forEach((interval) => {
    const start = Math.max(interval.start, barStartMinutes, nowMinutes);
    const end = Math.min(interval.end, barEndMinutes);
    if (start >= end) return;
    addSegment(barTrack, start, end, barStartMinutes, getEffectiveState(interval, nowMinutes));
  });
}

function updateTimelines(nowMinutes) {
  seatSchedules.forEach((seat) => {
    const timeline = document.getElementById(`timeline${seat.id}`);
    if (!timeline) return;
    timeline.querySelectorAll('.bar').forEach((bar) => updateTimelineBar(seat, bar, nowMinutes));
  });
}

// 要約の1行を「前の文字・強調する文字・後ろの文字」で書き込む（強調は数字や時刻に使う）
function setSummaryLine(el, before, emphasis = '', after = '') {
  el.replaceChildren();
  if (before) el.append(before);
  if (emphasis) {
    const emphasisEl = document.createElement('span');
    emphasisEl.className = 'summary-emphasis';
    emphasisEl.textContent = emphasis;
    el.append(emphasisEl);
  }
  if (after) el.append(after);
}

// 要約（スマホのみ表示）：上の行に状態、下の行に残席数や空く時刻
function updateSummary(nowMinutes) {
  const summaryEl = document.getElementById('summary');
  const statusEl = document.getElementById('summary-status');
  const detailEl = document.getElementById('summary-detail');
  if (!summaryEl || !statusEl || !detailEl) return;

  setSummaryLine(detailEl, '');

  if (nowMinutes < OPEN_MINUTES) {
    summaryEl.dataset.state = 'closed';
    setSummaryLine(statusEl, '開館前');
    setSummaryLine(detailEl, '', formatMinutes(OPEN_MINUTES), 'から');
    return;
  }

  if (nowMinutes >= CLOSE_MINUTES) {
    summaryEl.dataset.state = 'closed';
    setSummaryLine(statusEl, '閉館');
    return;
  }

  const freeCount = seatSchedules.filter((seat) => !getActiveInterval(seat, nowMinutes)).length;
  if (freeCount > 0) {
    summaryEl.dataset.state = 'free';
    setSummaryLine(statusEl, '空席');
    setSummaryLine(detailEl, '残り', String(freeCount), '席');
    return;
  }

  summaryEl.dataset.state = 'full';
  setSummaryLine(statusEl, '満席');
  const nextFreeTimes = seatSchedules
    .map((seat) => getNextFreeMinutes(seat, nowMinutes))
    .filter((time) => time !== null);
  if (nextFreeTimes.length > 0) {
    setSummaryLine(detailEl, '最短', formatMinutes(Math.min(...nextFreeTimes)), 'から空き');
  } else {
    setSummaryLine(detailEl, '本日の空きなし');
  }
}

function updateEverything() {
  const nowMinutes = getCurrentMinutes();
  updateClock(nowMinutes);
  updateSummary(nowMinutes);
  updateSeatStates(nowMinutes);
  updateTimelines(nowMinutes);
  updateQuickActions(nowMinutes);
}

// ===== ポップアップ（PC のみ） =====
function showMessage(message) {
  const messageEl = document.getElementById('popup-message');
  if (messageEl) messageEl.textContent = message;
}

function showCompletion(message) {
  const toast = document.getElementById('completion-toast');
  if (!toast) return;

  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(completionTimeoutId);
  completionTimeoutId = window.setTimeout(() => {
    toast.hidden = true;
    completionTimeoutId = null;
  }, 3000);
}

// 1. クイックアクション と 2. 予約登録 のどちらかを出す
function showPanel(panel) {
  document.getElementById('quick-panel').hidden = panel !== 'quick';
  document.getElementById('reserve-panel').hidden = panel !== 'reserve';
  showMessage('');
}

// 空席なら「今すぐ利用」、利用中なら「返却」「延長」を出す
function updateQuickActions(nowMinutes = getCurrentMinutes()) {
  const schedule = getSchedule(selectedSeatId);
  if (!schedule) return;
  const isInUse = Boolean(getActiveInterval(schedule, nowMinutes));
  document.getElementById('use-now-button').hidden = isInUse;
  document.getElementById('return-button').hidden = !isInUse;
  document.getElementById('extend-button').hidden = !isInUse;
}

function openPopup(seatId) {
  selectedSeatId = seatId;
  document.getElementById('popup-seat-number').textContent = String(seatId);
  document.getElementById('popup').hidden = false;
  showPanel('quick');
  updateQuickActions();
}

function openReservePanel() {
  showPanel('reserve');
  renderReservations();
}

function backToQuickPanel() {
  showPanel('quick');
  updateQuickActions();
}

// 登録の後始末：保存して画面を描き直し、保存できたら完了を知らせる
function finishChange(completionMessage) {
  const saved = saveSeatSchedules();
  updateEverything();
  if (!saved) return;
  showMessage('');
  showCompletion(completionMessage);
}

// 終了時刻が閉館を超えるときは、閉館までにしてよいか確かめる。やめたら null
function capAtClosing(end, action) {
  if (end <= CLOSE_MINUTES) return end;
  const closeText = formatMinutes(CLOSE_MINUTES);
  if (!window.confirm(`${action}時間が閉館時刻（${closeText}）を超えます。${closeText}まで${action}しますか？`)) {
    return null;
  }
  return CLOSE_MINUTES;
}

function renderReservations() {
  const list = document.getElementById('reservation-list');
  const schedule = getSchedule(selectedSeatId);
  if (!list || !schedule) return;

  list.replaceChildren();
  const nowMinutes = getCurrentMinutes();
  schedule.intervals
    .filter((interval) => interval.state === 'reserved' && interval.start > nowMinutes)
    .sort((a, b) => a.start - b.start)
    .forEach((interval) => {
      const item = document.createElement('li');
      item.className = 'reservation-item';

      const time = document.createElement('span');
      time.className = 'reservation-time';
      time.textContent = `${formatMinutes(interval.start)}〜`;

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'cancel-button';
      cancelButton.textContent = 'キャンセル';
      cancelButton.addEventListener('click', () => cancelReservation(schedule, interval));

      item.append(time, cancelButton);
      list.appendChild(item);
    });
}

function cancelReservation(schedule, interval) {
  schedule.intervals.splice(schedule.intervals.indexOf(interval), 1);
  finishChange('予約をキャンセルしました。');
  renderReservations();
}

function registerUseNow() {
  const schedule = getSchedule(selectedSeatId);
  if (!schedule) return;

  const start = getCurrentMinutes();
  if (start < OPEN_MINUTES || start >= CLOSE_MINUTES) {
    showMessage(`開館時間（${formatMinutes(OPEN_MINUTES)}〜${formatMinutes(CLOSE_MINUTES)}）の間に利用を開始してください。`);
    return;
  }
  const end = capAtClosing(start + USE_MINUTES, '利用');
  if (end === null) return;
  if (intervalsOverlap(schedule, start, end)) {
    showMessage('利用時間に予約または利用予定が重なっています。');
    return;
  }

  schedule.intervals.push({ state: 'in-use', start, end });
  finishChange('利用を開始しました。');
}

function returnSeat() {
  const schedule = getSchedule(selectedSeatId);
  if (!schedule) return;
  const nowMinutes = getCurrentMinutes();
  const activeInterval = getActiveInterval(schedule, nowMinutes);
  if (!activeInterval) return;

  // 始まったばかりなら記録ごと消し、そうでなければ今の時刻で終わらせる
  if (nowMinutes <= activeInterval.start) {
    schedule.intervals.splice(schedule.intervals.indexOf(activeInterval), 1);
  } else {
    activeInterval.end = nowMinutes;
  }
  finishChange('返却しました。');
}

function extendUse() {
  const schedule = getSchedule(selectedSeatId);
  if (!schedule) return;
  const activeInterval = getActiveInterval(schedule, getCurrentMinutes());
  if (!activeInterval) return;

  const end = capAtClosing(activeInterval.end + USE_MINUTES, '延長');
  if (end === null) return;
  if (end <= activeInterval.end) {
    showMessage('閉館時刻を超えて延長することはできません。');
    return;
  }
  if (intervalsOverlap(schedule, activeInterval.end, end, activeInterval)) {
    showMessage('延長時間に予約または利用予定が重なっています。');
    return;
  }

  activeInterval.end = end;
  finishChange('利用時間を延長しました。');
}

function registerReservation(event) {
  event.preventDefault();
  const schedule = getSchedule(selectedSeatId);
  if (!schedule) return;

  const start = parseTime(document.getElementById('reserve-start').value);
  if (start === null || start < OPEN_MINUTES || start >= CLOSE_MINUTES || start <= getCurrentMinutes()) {
    showMessage(`予約開始時刻は、現在時刻より後の${formatMinutes(OPEN_MINUTES)}〜${formatMinutes(CLOSE_MINUTES)}に設定してください。`);
    return;
  }

  const end = capAtClosing(start + USE_MINUTES, '予約');
  if (end === null) return;
  if (intervalsOverlap(schedule, start, end)) {
    showMessage('予約時間に他の予約または利用予定が重なっています。');
    return;
  }

  schedule.intervals.push({ state: 'reserved', start, end });
  finishChange('予約を登録しました。');
  renderReservations();
}

function setupPopup() {
  // スマホは表示のみなので、座席を押しても何も開かない
  if (isMobile) return;

  seatSchedules.forEach((seat) => {
    const seatEl = document.getElementById(`seat${seat.id}`);
    if (seatEl) seatEl.addEventListener('click', () => openPopup(seat.id));
  });

  document.getElementById('popup-close').addEventListener('click', () => {
    document.getElementById('popup').hidden = true;
  });
  document.getElementById('use-now-button').addEventListener('click', registerUseNow);
  document.getElementById('return-button').addEventListener('click', returnSeat);
  document.getElementById('extend-button').addEventListener('click', extendUse);
  document.getElementById('reserve-button').addEventListener('click', openReservePanel);
  document.getElementById('back-button').addEventListener('click', backToQuickPanel);
  document.getElementById('reserve-form').addEventListener('submit', registerReservation);
}

// 満席の確認用（?check=full）：全席を「開館から、今の1時間後〜約3時間後まで使用中」にする
function fillAllSeatsForCheck() {
  const nowMinutes = getCurrentMinutes();
  seatSchedules.forEach((seat, index) => {
    const end = Math.min(nowMinutes + 60 + index * 10, CLOSE_MINUTES);
    seat.intervals = [{ state: 'in-use', start: OPEN_MINUTES, end }];
  });
}

// ===== 起動 =====
setupPopup();
if (checkMode === 'full') fillAllSeatsForCheck();
updateEverything();
setInterval(updateEverything, 60 * 1000);
