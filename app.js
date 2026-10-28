const BAR_TOTAL_MINUTES = 360;
const OPEN_MINUTES = 9 * 60;
const CLOSE_MINUTES = 21 * 60;
const STORAGE_KEY = 'lc-seat-checker-schedules';

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
    && data.length === 17
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

function saveSeatSchedules() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seatSchedules));
    return true;
  } catch (error) {
    console.error('座席スケジュールを保存できませんでした。', error);
    showMessage('登録内容を保存できませんでした。');
    return false;
  }
}

function getNowInJapan() {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcTime + 9 * 60 * 60 * 1000);
}

function formatTime(date) {
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}

function getSchedule(seatId) {
  return seatSchedules.find((seat) => seat.id === seatId);
}

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

function setCurrentTime(now) {
  const timeEl = document.getElementById('time');
  if (timeEl) timeEl.textContent = formatTime(now);
}

function updateSeatStates(nowMinutes) {
  for (let seatId = 1; seatId <= 17; seatId += 1) {
    const seatEl = document.getElementById(`seat${seatId}`);
    if (!seatEl) continue;

    seatEl.classList.remove('free', 'reserved', 'in-use');
    const schedule = getSchedule(seatId);
    const isInUse = schedule && getActiveInterval(schedule, nowMinutes);
    seatEl.classList.add(isInUse ? 'in-use' : 'free');
  }
}

function clearSegments(barTrack) {
  barTrack.querySelectorAll('.segment').forEach((segment) => segment.remove());
}

function addSegment(barTrack, leftPercent, widthPercent, className) {
  const segment = document.createElement('div');
  segment.className = `segment ${className}`;
  segment.style.left = `${leftPercent}%`;
  segment.style.width = `${widthPercent}%`;
  barTrack.appendChild(segment);
}

function updateTimelineBar(seatId, bar, nowMinutes) {
  const barTrack = bar.querySelector('.bar-track');
  if (!barTrack) return;
  clearSegments(barTrack);

  const barStartMinutes = Number(bar.dataset.startHour) * 60;
  const barEndMinutes = barStartMinutes + BAR_TOTAL_MINUTES;
  const pastWidth = Math.max(0, Math.min(nowMinutes, barEndMinutes) - barStartMinutes);
  if (pastWidth > 0) {
    addSegment(barTrack, 0, (pastWidth / BAR_TOTAL_MINUTES) * 100, 'past');
  }

  const schedule = getSchedule(seatId);
  if (!schedule) return;

  schedule.intervals.forEach((interval) => {
    const start = Math.max(interval.start, barStartMinutes, nowMinutes);
    const end = Math.min(interval.end, barEndMinutes);
    if (start >= end) return;

    const leftPercent = ((start - barStartMinutes) / BAR_TOTAL_MINUTES) * 100;
    const widthPercent = ((end - start) / BAR_TOTAL_MINUTES) * 100;
    addSegment(barTrack, leftPercent, widthPercent, getEffectiveState(interval, nowMinutes));
  });
}

function updateTimelines(nowMinutes) {
  for (let seatId = 1; seatId <= 17; seatId += 1) {
    const timeline = document.getElementById(`timeline${seatId}`);
    if (!timeline) continue;
    timeline.querySelectorAll('.bar').forEach((bar) => {
      updateTimelineBar(seatId, bar, nowMinutes);
    });
  }
}

function updateEverything() {
  const now = getNowInJapan();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  setCurrentTime(now);
  updateSeatStates(nowMinutes);
  updateTimelines(nowMinutes);
  updateQuickActions(nowMinutes);
}

function showMessage(message) {
  const messageEl = document.getElementById('popup-message');
  if (messageEl) messageEl.textContent = message;
}

function updateQuickActions(nowMinutes = getCurrentMinutes()) {
  const schedule = getSchedule(selectedSeatId);
  if (!schedule) return;
  const isInUse = Boolean(getActiveInterval(schedule, nowMinutes));
  document.getElementById('use-now-button').hidden = isInUse;
  document.getElementById('return-button').hidden = !isInUse;
  document.getElementById('extend-button').hidden = !isInUse;
}

function getCurrentMinutes() {
  const now = getNowInJapan();
  return now.getHours() * 60 + now.getMinutes();
}

function intervalsOverlap(seat, start, end, ignoredInterval = null) {
  return seat.intervals.some((interval) => (
    interval !== ignoredInterval
    && start < interval.end
    && end > interval.start
  ));
}

function capAtClosing(end, action) {
  if (end <= CLOSE_MINUTES) return end;
  if (!window.confirm(`${action}時間が閉館時刻（21:00）を超えます。21:00まで${action}しますか？`)) {
    return null;
  }
  return CLOSE_MINUTES;
}

function openPopup(seatId) {
  selectedSeatId = seatId;
  document.getElementById('popup-seat-number').textContent = String(seatId);
  document.getElementById('quick-panel').hidden = false;
  document.getElementById('reserve-panel').hidden = true;
  document.getElementById('popup').hidden = false;
  showMessage('');
  updateQuickActions();
}

function renderReservations() {
  const list = document.getElementById('reservation-list');
  const schedule = getSchedule(selectedSeatId);
  if (!list || !schedule) return;

  list.replaceChildren();
  const nowMinutes = getCurrentMinutes();
  schedule.intervals
    .map((interval, index) => ({ interval, index }))
    .filter(({ interval }) => interval.state === 'reserved' && interval.start > nowMinutes)
    .sort((a, b) => a.interval.start - b.interval.start)
    .forEach(({ interval, index }) => {
      const item = document.createElement('li');
      item.className = 'reservation-item';

      const time = document.createElement('span');
      time.className = 'reservation-time';
      time.textContent = `${formatMinutes(interval.start)}〜`;

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'cancel-button';
      cancelButton.dataset.index = String(index);
      cancelButton.textContent = 'キャンセル';
      cancelButton.addEventListener('click', () => {
        schedule.intervals.splice(index, 1);
        const saved = saveSeatSchedules();
        updateEverything();
        renderReservations();
        if (saved) showMessage('予約をキャンセルしました。');
      });

      item.append(time, cancelButton);
      list.appendChild(item);
    });
}

function formatMinutes(minutes) {
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
  const minute = String(minutes % 60).padStart(2, '0');
  return `${hour}:${minute}`;
}

function registerUseNow() {
  const schedule = getSchedule(selectedSeatId);
  if (!schedule) return;

  const start = getCurrentMinutes();
  if (start < OPEN_MINUTES || start >= CLOSE_MINUTES) {
    showMessage('開館時間（09:00〜21:00）の間に利用を開始してください。');
    return;
  }
  const end = capAtClosing(start + 120, '利用');
  if (end === null) return;
  if (intervalsOverlap(schedule, start, end)) {
    showMessage('利用時間に予約または利用予定が重なっています。');
    return;
  }

  schedule.intervals.push({ state: 'in-use', start, end });
  const saved = saveSeatSchedules();
  updateEverything();
  if (saved) showMessage('');
}

function returnSeat() {
  const schedule = getSchedule(selectedSeatId);
  if (!schedule) return;
  const nowMinutes = getCurrentMinutes();
  const activeInterval = getActiveInterval(schedule, nowMinutes);
  if (!activeInterval) return;

  if (nowMinutes <= activeInterval.start) {
    schedule.intervals.splice(schedule.intervals.indexOf(activeInterval), 1);
  } else {
    activeInterval.end = nowMinutes;
  }
  const saved = saveSeatSchedules();
  updateEverything();
  if (saved) showMessage('');
}

function extendUse() {
  const schedule = getSchedule(selectedSeatId);
  if (!schedule) return;
  const nowMinutes = getCurrentMinutes();
  const activeInterval = getActiveInterval(schedule, nowMinutes);
  if (!activeInterval) return;

  const end = capAtClosing(activeInterval.end + 120, '延長');
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
  const saved = saveSeatSchedules();
  updateEverything();
  if (saved) showMessage('');
}

function parseTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function registerReservation(event) {
  event.preventDefault();
  const schedule = getSchedule(selectedSeatId);
  if (!schedule) return;

  const start = parseTime(document.getElementById('reserve-start').value);
  const nowMinutes = getCurrentMinutes();
  if (start === null || start < OPEN_MINUTES || start >= CLOSE_MINUTES || start <= nowMinutes) {
    showMessage('予約開始時刻は、現在時刻より後の09:00〜21:00に設定してください。');
    return;
  }

  const end = capAtClosing(start + 120, '予約');
  if (end === null) return;
  if (intervalsOverlap(schedule, start, end)) {
    showMessage('予約時間に他の予約または利用予定が重なっています。');
    return;
  }

  schedule.intervals.push({ state: 'reserved', start, end });
  const saved = saveSeatSchedules();
  updateEverything();
  renderReservations();
  if (saved) showMessage('');
}

function setupPopup() {
  for (let seatId = 1; seatId <= 17; seatId += 1) {
    const seatEl = document.getElementById(`seat${seatId}`);
    if (seatEl) seatEl.addEventListener('click', () => openPopup(seatId));
  }

  document.getElementById('popup-close').addEventListener('click', () => {
    document.getElementById('popup').hidden = true;
  });
  document.getElementById('use-now-button').addEventListener('click', registerUseNow);
  document.getElementById('return-button').addEventListener('click', returnSeat);
  document.getElementById('extend-button').addEventListener('click', extendUse);
  document.getElementById('reserve-button').addEventListener('click', () => {
    document.getElementById('quick-panel').hidden = true;
    document.getElementById('reserve-panel').hidden = false;
    showMessage('');
    renderReservations();
  });
  document.getElementById('back-button').addEventListener('click', () => {
    document.getElementById('quick-panel').hidden = false;
    document.getElementById('reserve-panel').hidden = true;
    showMessage('');
    updateQuickActions();
  });
  document.getElementById('reserve-form').addEventListener('submit', registerReservation);
}

setupPopup();
updateEverything();
setInterval(updateEverything, 60 * 1000);
