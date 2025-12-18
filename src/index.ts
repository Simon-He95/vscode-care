import { addEventListener, createBottomBar, createExtension, executeCommand, message } from '@vscode-use/utils'
import * as vscode from 'vscode'
import { getDayOfWeek, getSpecialHoliday, isWeekend, timeDifference } from './utils'

const COMMAND_MENU = 'vscode-care.menu'
const COMMAND_TOGGLE_ENABLED = 'vscode-care.toggleEnabled'
const COMMAND_SNOOZE_10M = 'vscode-care.snooze10m'
const COMMAND_SNOOZE_30M = 'vscode-care.snooze30m'
const COMMAND_SNOOZE_60M = 'vscode-care.snooze60m'
const COMMAND_RESUME = 'vscode-care.resume'
const COMMAND_ALLOW_TODAY = 'vscode-care.allowToday'
const COMMAND_OPEN_REPORT = 'vscode-care.openReport'

function parseTime(value: string) {
  const match = /^([01]?\d|2[0-3]):([0-5]?\d)$/.exec(value.trim())
  if (!match)
    return
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  }
}

function formatTime(hour: number, minute: number) {
  return `${hour}:${String(minute).padStart(2, '0')}`
}

function normalizeTime(value: unknown, fallback: string) {
  if (typeof value !== 'string')
    return fallback
  const next = value.trim()
  const parsed = parseTime(next)
  return parsed ? formatTime(parsed.hour, parsed.minute) : fallback
}

function toMinutes(time: string) {
  const parsed = parseTime(time)
  if (!parsed)
    return 0
  return parsed.hour * 60 + parsed.minute
}

const MIN_06_00 = toMinutes('6:00')
const MIN_10_00 = toMinutes('10:00')
const MIN_11_30 = toMinutes('11:30')
const MIN_12_00 = toMinutes('12:00')
const MIN_12_30 = toMinutes('12:30')
const MIN_13_00 = toMinutes('13:00')
const MIN_13_30 = toMinutes('13:30')
const MIN_18_10 = toMinutes('18:10')
const MIN_20_00 = toMinutes('20:00')

interface CareConfig {
  enabled: boolean
  workStart: string
  workEnd: string
  weekendBlock: boolean
  waterReminder: boolean
  statusAnimation: boolean
  breakReminder: boolean
  breakIntervalMinutes: number
  idleResetMinutes: number
}

function readConfig(): CareConfig {
  const config = vscode.workspace.getConfiguration('vscode-care')
  const breakIntervalMinutes = Math.max(10, Number(config.get('breakIntervalMinutes', 50)) || 50)
  const idleResetMinutes = Math.max(1, Number(config.get('idleResetMinutes', 5)) || 5)
  return {
    enabled: config.get<boolean>('enabled', true),
    workStart: normalizeTime(config.get('workStart'), '9:00'),
    workEnd: normalizeTime(config.get('workEnd'), '18:00'),
    weekendBlock: config.get<boolean>('weekendBlock', true),
    waterReminder: config.get<boolean>('waterReminder', true),
    statusAnimation: config.get<boolean>('statusAnimation', true),
    breakReminder: config.get<boolean>('breakReminder', true),
    breakIntervalMinutes,
    idleResetMinutes,
  }
}

function getDateKey(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

let careConfig = readConfig()

let curText = ''
let countdownTimer: ReturnType<typeof setInterval> | undefined

let statusAnimationTimer: ReturnType<typeof setInterval> | undefined
let tickerTimer: ReturnType<typeof setInterval> | undefined

let lastDateKey = ''
let snoozeUntilMs = 0
let snoozedContext = false
let allowedCodingDateKey = ''
let lastWaterReminderKey = ''

const STATS_KEY = 'vscode-care.stats.v1'
interface DayStats {
  activeMs: number
  breakCount: number
}

let todayStats: DayStats = {
  activeMs: 0,
  breakCount: 0,
}

let lastTypingAtMs = 0
let sessionStartAtMs = 0
let breakReminderShownForSession = false
let idleState = true

let lastTickAtMs = 0
let lastStatsSavedAtMs = 0
let lastSavedActiveMs = 0
let lastSavedBreakCount = 0

let extensionContext: vscode.ExtensionContext | undefined

function isSnoozed(nowMs = Date.now()) {
  return snoozeUntilMs > nowMs
}

function formatDuration(ms: number) {
  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0)
    return `${minutes}m`
  return `${hours}h ${minutes}m`
}

function setSnoozeUntil(untilMs: number, context: vscode.ExtensionContext) {
  snoozeUntilMs = untilMs
  snoozedContext = true
  void vscode.commands.executeCommand('setContext', 'vscode-care.snoozed', snoozedContext)
  void context.globalState.update('vscode-care.snoozeUntilMs', snoozeUntilMs)
}

function setSnooze(minutes: number, context: vscode.ExtensionContext) {
  setSnoozeUntil(Date.now() + minutes * 60_000, context)
}

function resumeSnooze(context: vscode.ExtensionContext) {
  snoozeUntilMs = 0
  snoozedContext = false
  void vscode.commands.executeCommand('setContext', 'vscode-care.snoozed', snoozedContext)
  void context.globalState.update('vscode-care.snoozeUntilMs', snoozeUntilMs)
}

function isAllowedToCodeToday(dateKey: string) {
  return allowedCodingDateKey === dateKey
}

function allowCodingToday(context: vscode.ExtensionContext, dateKey: string) {
  allowedCodingDateKey = dateKey
  void context.globalState.update('vscode-care.allowedCodingDateKey', allowedCodingDateKey)
}

function loadTodayStats(context: vscode.ExtensionContext, dateKey: string) {
  const map = context.globalState.get<Record<string, DayStats>>(STATS_KEY, {})
  todayStats = map[dateKey] || { activeMs: 0, breakCount: 0 }
  lastSavedActiveMs = todayStats.activeMs
  lastSavedBreakCount = todayStats.breakCount
  lastStatsSavedAtMs = Date.now()
}

function saveTodayStats(context: vscode.ExtensionContext, dateKey: string) {
  const map = context.globalState.get<Record<string, DayStats>>(STATS_KEY, {})
  map[dateKey] = todayStats
  const keys = Object.keys(map).sort()
  if (keys.length > 30) {
    for (const key of keys.slice(0, keys.length - 30))
      delete map[key]
  }
  void context.globalState.update(STATS_KEY, map)
  lastSavedActiveMs = todayStats.activeMs
  lastSavedBreakCount = todayStats.breakCount
  lastStatsSavedAtMs = Date.now()
}

function stopStatusAnimation() {
  if (statusAnimationTimer) {
    clearInterval(statusAnimationTimer)
    statusAnimationTimer = undefined
  }
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = undefined
  }
}

function stopAllTimers() {
  stopStatusAnimation()
  stopCountdown()
  if (tickerTimer) {
    clearInterval(tickerTimer)
    tickerTimer = undefined
  }
}

export = createExtension((context) => {
  extensionContext = context
  snoozeUntilMs = context.globalState.get<number>('vscode-care.snoozeUntilMs', 0)
  allowedCodingDateKey = context.globalState.get<string>('vscode-care.allowedCodingDateKey', '')
  snoozedContext = isSnoozed()
  void vscode.commands.executeCommand('setContext', 'vscode-care.snoozed', snoozedContext)

  lastDateKey = getDateKey()
  loadTodayStats(context, lastDateKey)
  lastTickAtMs = Date.now()

  const btn = createBottomBar({
    position: 'right',
    text: '今天也要元气满满鸭 🦆',
    tooltip: '今天也要元气满满鸭 🦆 ',
    color: '#82c6f7',
    command: COMMAND_MENU,
  })

  function applyEnabledState() {
    void vscode.commands.executeCommand('setContext', 'vscode-care.enabled', careConfig.enabled)
    if (!careConfig.enabled) {
      stopAllTimers()
      btn.text = btn.tooltip = 'vscode-care 已暂停'
      btn.color = '#999999'
      btn.show()
      return
    }

    if (!careConfig.statusAnimation)
      stopStatusAnimation()

    if (careConfig.statusAnimation && !statusAnimationTimer) {
      const colors = ['#2ed9b1', '#82c6f7', '#40a9f0', '#a4f6db', '#a6f9fb', '#24e1ec', '#7df8bd']
      let count = 1
      statusAnimationTimer = setInterval(() => {
        btn.text = `今天也要元气满满鸭${' '.repeat(6 - count)}🦆${'💩'.repeat(count - 1)}`
        btn.color = colors[count]
        count = count > 5 ? 1 : count + 1
        btn.show()
      }, 500)
    }

    if (!tickerTimer) {
      tickerTimer = setInterval(() => {
        runCare('timer')
      }, 30_000)
    }
  }

  let isCountDown = false
  const earlyMsgs = [
    '我的天，你今天也来的太早了吧～ 👋',
    '早上好鸭，程序员～ 🧑‍💻',
    '来的早，别忘了吃早餐哦～ 🍙',
  ]

  const endMsgs = [
    '下班啦，下班啦～ 🎉',
    '请立即停下你手头的工作，收拾东西，下班～ 🏃',
    '重复一遍，请立即停下你手头的工作，收拾东西，下班～ 🏃',
    '现在应该下班了，注意休息哦！',
    '工作辛苦了，可以考虑下班啦！',
    '别忘了休息，现在是下班的好时机！',
    '注意劳逸结合，下班时间到了！',
  ]

  if (getDayOfWeek() === '星期五') {
    endMsgs.push(...[
      '周五了，周末愉快~',
    ])
  }

  const beforeLunchMsgs = getDayOfWeek() === '星期四'
    ? ['你是不是忘记今天是肯德基疯狂星期四了，只准吃炸鸡 🍟']
    : [
        '是不是该准备吃中饭了，少年～ 🍚',
        '人是铁，饭是钢，一顿不吃饿的慌 🍚',
        '今天吃什么好呢？是吃咖喱 🍛 呢，还是牛排 🥩 呢？',
      ]

  const lunchMsgs = [
    '你不会午休不打游戏，在这里写Bug吧～ 🐛',
    '请注意劳逸结合，是适合展现你真正的技术了~ 🎮',
    '我维克托，粑粑C! 😆',
    'diu diu diu diu diu ~ 🐭',
  ]

  const warningMsgs = [
    '小伙子注意休息，肾不要了？😂',
    '你已经透支了，请立刻休息 🤚',
    '有什么事情不能拖到明天再完成的吗？ 🤔️',
    '警告！警告！⚠️',
  ]

  let isRun = false
  const festival = getSpecialHoliday()
  let once = false
  let reportPanel: vscode.WebviewPanel | undefined

  function getReportHtml() {
    const dateKey = getDateKey()
    const snoozed = isSnoozed()
    const snoozeText = snoozed ? new Date(snoozeUntilMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'
    const enabledText = careConfig.enabled ? 'ON' : 'OFF'
    const weekendAllowedText = isAllowedToCodeToday(dateKey) ? 'YES' : 'NO'

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>vscode-care</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 16px;
      line-height: 1.5;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 12px 0 16px;
    }
    .card {
      border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
      border-radius: 10px;
      padding: 12px;
    }
    .k {
      opacity: 0.75;
      font-size: 12px;
      margin-bottom: 4px;
    }
    .v {
      font-size: 20px;
      font-weight: 600;
    }
    .btns {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    button {
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
      background: color-mix(in srgb, currentColor 6%, transparent);
      color: inherit;
      cursor: pointer;
    }
    button:hover {
      background: color-mix(in srgb, currentColor 10%, transparent);
    }
    .hint {
      opacity: 0.75;
      font-size: 12px;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <h2>vscode-care · Today</h2>
  <div class="grid">
    <div class="card">
      <div class="k">Approx. active coding</div>
      <div class="v">${formatDuration(todayStats.activeMs)}</div>
    </div>
    <div class="card">
      <div class="k">Breaks detected</div>
      <div class="v">${todayStats.breakCount}</div>
    </div>
    <div class="card">
      <div class="k">Enabled</div>
      <div class="v">${enabledText}</div>
    </div>
    <div class="card">
      <div class="k">Snoozed until</div>
      <div class="v">${snoozeText}</div>
    </div>
  </div>
  <div class="card">
    <div class="k">Config</div>
    <div>Work: ${careConfig.workStart} ~ ${careConfig.workEnd}</div>
    <div>Break reminder: ${careConfig.breakReminder ? `ON (${careConfig.breakIntervalMinutes}m)` : 'OFF'}</div>
    <div>Idle reset: ${careConfig.idleResetMinutes}m</div>
    <div>Weekend allowed today: ${weekendAllowedText}</div>
  </div>

  <div class="btns">
    <button id="toggle">Toggle enabled</button>
    <button id="report">Refresh</button>
    <button id="snooze10">Snooze 10m</button>
    <button id="resume">Resume</button>
    <button id="allow">Allow today</button>
    <button id="settings">Settings</button>
  </div>

  <div class="hint">Active time is estimated based on recent typing + window focus.</div>
  <script>
    const vscode = acquireVsCodeApi()
    const bind = (id, type) => document.getElementById(id)?.addEventListener('click', () => vscode.postMessage({ type }))
    bind('toggle', 'toggle')
    bind('report', 'refresh')
    bind('snooze10', 'snooze10')
    bind('resume', 'resume')
    bind('allow', 'allowToday')
    bind('settings', 'settings')
  </script>
</body>
</html>`
  }

  function refreshReport() {
    if (!reportPanel)
      return
    reportPanel.webview.html = getReportHtml()
  }

  function openReport() {
    if (reportPanel) {
      reportPanel.reveal()
      refreshReport()
      return
    }

    reportPanel = vscode.window.createWebviewPanel(
      'vscode-care.report',
      'vscode-care: Today Report',
      vscode.ViewColumn.Beside,
      { enableScripts: true },
    )

    reportPanel.onDidDispose(() => {
      reportPanel = undefined
    })

    reportPanel.webview.onDidReceiveMessage((msg) => {
      if (!msg || typeof msg !== 'object')
        return
      const type = (msg as any).type as string
      if (type === 'toggle')
        void vscode.commands.executeCommand(COMMAND_TOGGLE_ENABLED)
      if (type === 'refresh')
        refreshReport()
      if (type === 'snooze10')
        void vscode.commands.executeCommand(COMMAND_SNOOZE_10M)
      if (type === 'resume')
        void vscode.commands.executeCommand(COMMAND_RESUME)
      if (type === 'allowToday')
        void vscode.commands.executeCommand(COMMAND_ALLOW_TODAY)
      if (type === 'settings')
        void vscode.commands.executeCommand('workbench.action.openSettings', 'vscode-care')
    })

    refreshReport()
  }

  function showSnoozeStatus() {
    stopStatusAnimation()
    stopCountdown()
    const until = new Date(snoozeUntilMs)
    const hh = String(until.getHours()).padStart(2, '0')
    const mm = String(until.getMinutes()).padStart(2, '0')
    btn.text = btn.tooltip = `😴 已静音至 ${hh}:${mm}`
    btn.color = '#999999'
    btn.show()
  }

  function runCare(trigger: 'typing' | 'timer', reason?: number) {
    if (!careConfig.enabled)
      return
    if (trigger === 'typing' && reason === 1)
      return

    const now = new Date()
    const nowMs = now.getTime()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const dateKey = getDateKey(now)
    const workStartMinutes = toMinutes(careConfig.workStart)
    const workEndMinutes = toMinutes(careConfig.workEnd)

    if (lastDateKey !== dateKey) {
      if (lastDateKey)
        saveTodayStats(context, lastDateKey)
      lastDateKey = dateKey
      loadTodayStats(context, dateKey)
      isCountDown = false
      lastTypingAtMs = 0
      sessionStartAtMs = 0
      breakReminderShownForSession = false
      idleState = true
      lastWaterReminderKey = ''
      lastTickAtMs = nowMs
    }

    if (festival && !once) {
      message.info(festival)
      once = true
    }

    const idleResetMs = careConfig.idleResetMinutes * 60_000
    if (trigger === 'typing') {
      if (lastTypingAtMs && nowMs - lastTypingAtMs > idleResetMs) {
        todayStats.breakCount += 1
        sessionStartAtMs = nowMs
        breakReminderShownForSession = false
      }
      if (!sessionStartAtMs) {
        sessionStartAtMs = nowMs
        breakReminderShownForSession = false
      }
      lastTypingAtMs = nowMs
      idleState = false
    }
    else {
      const tickDeltaMs = lastTickAtMs ? Math.max(0, nowMs - lastTickAtMs) : 0
      lastTickAtMs = nowMs
      const idleNow = !lastTypingAtMs || nowMs - lastTypingAtMs > idleResetMs

      if (!idleNow && vscode.window.state.focused)
        todayStats.activeMs += tickDeltaMs

      if (!idleState && idleNow && lastTypingAtMs) {
        todayStats.breakCount += 1
        idleState = true
        sessionStartAtMs = 0
        breakReminderShownForSession = false
      }
      else if (idleState && !idleNow) {
        idleState = false
        sessionStartAtMs = sessionStartAtMs || lastTypingAtMs || nowMs
        breakReminderShownForSession = false
      }

      if (
        (todayStats.activeMs - lastSavedActiveMs >= 60_000)
        || (todayStats.breakCount !== lastSavedBreakCount)
        || (nowMs - lastStatsSavedAtMs >= 5 * 60_000)
      ) {
        saveTodayStats(context, dateKey)
      }
    }

    const snoozed = isSnoozed(nowMs)
    if (snoozedContext !== snoozed) {
      snoozedContext = snoozed
      void vscode.commands.executeCommand('setContext', 'vscode-care.snoozed', snoozedContext)
    }
    refreshReport()
    if (snoozed && trigger === 'timer') {
      showSnoozeStatus()
      return
    }

    if (
      trigger === 'timer'
      && careConfig.breakReminder
      && !snoozed
      && !idleState
      && sessionStartAtMs
      && !breakReminderShownForSession
      && vscode.window.state.focused
      && nowMinutes > workStartMinutes
      && nowMinutes <= workEndMinutes
      && nowMs - sessionStartAtMs >= careConfig.breakIntervalMinutes * 60_000
    ) {
      breakReminderShownForSession = true
      const workMinutes = Math.floor((nowMs - sessionStartAtMs) / 60_000)
      message.info({
        message: `你已经连续 coding ${workMinutes} 分钟了，起来走走/喝水休息一下？`,
        buttons: ['Snooze 10m', '打开今日报表', '知道了'],
      }).then((res) => {
        if (res === 'Snooze 10m')
          setSnooze(10, context)
        if (res === '打开今日报表')
          void vscode.commands.executeCommand(COMMAND_OPEN_REPORT)
      })
    }

    if (careConfig.weekendBlock && isWeekend()) {
      btn.tooltip = btn.text = '你小子，周末也在卷是吧，真要007？'
      btn.color = '#62BAF3'
      btn.show()
      stopStatusAnimation()

      if (trigger === 'typing' && !isAllowedToCodeToday(dateKey)) {
        executeCommand('undo')
        if (snoozed)
          return
        message.info({
          message: '周末了，不让你 coding，除非你选择继续卷 😠',
          buttons: ['继续卷'],
        }).then((c) => {
          if (c === '继续卷') {
            allowCodingToday(context, dateKey)
          }
        })
      }
      return
    }

    if (snoozed) {
      showSnoozeStatus()
      return
    }

    if (nowMinutes > MIN_06_00 && nowMinutes <= workStartMinutes) {
      stopStatusAnimation()
      if (isRun)
        return
      const run = () => {
        isRun = true
        const text = earlyMsgs[Math.floor(Math.random() * earlyMsgs.length)]
        if (curText === text)
          return
        curText = text
        btn.tooltip = btn.text = text
        btn.color = '#62BAF3'
        btn.show()
      }

      run()
      setTimeout(() => {
        isRun = false
      }, 60000)
      return
    }

    // 每隔30分钟提醒一次喝水
    if (trigger === 'typing'
      && careConfig.waterReminder
      && now.getMinutes() === 31) {
      const key = `${dateKey}:${now.getHours()}`
      if (lastWaterReminderKey !== key) {
        lastWaterReminderKey = key
        const text = '喝水时间到了，喝水喝水喝水～ 🍻'
        message.info(text)
      }
    }

    if (nowMinutes > workStartMinutes && nowMinutes <= MIN_10_00) {
      const text = '现在还早，再摸会鱼吧～ 😄'
      stopStatusAnimation()
      if (curText === text)
        return
      curText = text
      btn.color = '#70e5ab'
      btn.tooltip = btn.text = text
      btn.show()
      return
    }

    if (nowMinutes > MIN_11_30 && nowMinutes <= MIN_12_00) {
      stopStatusAnimation()
      if (isRun)
        return
      const run = () => {
        isRun = true
        const text = beforeLunchMsgs[Math.floor(Math.random() * beforeLunchMsgs.length)]
        if (curText === text)
          return
        curText = text
        btn.color = '#dec966'

        btn.tooltip = btn.text = text
        btn.show()
      }

      run()
      setTimeout(() => {
        isRun = false
      }, 60000)

      return
    }

    if (nowMinutes > MIN_12_00 && nowMinutes <= MIN_12_30) {
      stopStatusAnimation()
      const text = '你小子中饭也不吃，想卷死我们？😠'
      if (curText === text)
        return
      curText = text
      btn.color = '#4cb4d6'
      btn.tooltip = btn.text = text
      btn.show()
      return
    }

    if (nowMinutes > MIN_13_00 && nowMinutes <= MIN_13_30) {
      stopStatusAnimation()
      if (isRun)
        return
      const run = () => {
        isRun = true
        const text = lunchMsgs[Math.floor(Math.random() * lunchMsgs.length)]
        if (curText === text)
          return
        curText = text
        btn.color = '#f4d257'
        btn.tooltip = btn.text = text
        btn.show()
      }

      run()
      setTimeout(() => {
        isRun = false
      }, 60000)
      return
    }

    const endMinutes = workEndMinutes
    const countdownStartMinutes = Math.max(0, workEndMinutes - 60)

    if (nowMinutes >= countdownStartMinutes && nowMinutes < endMinutes) {
      stopStatusAnimation()
      if (isCountDown)
        return
      isCountDown = true
      btn.color = '#ea9148'
      countdownTimer = setInterval(() => {
        const text = `下班还有 ${timeDifference(careConfig.workEnd)}，加油～ 💪`
        curText = text
        btn.tooltip = btn.text = text
        btn.show()
      }, 1000)
      return
    }

    stopCountdown()
    isCountDown = false

    if (nowMinutes > workEndMinutes && nowMinutes <= MIN_18_10) {
      stopStatusAnimation()
      if (isRun)
        return
      const run = () => {
        isRun = true
        const text = endMsgs[Math.floor(Math.random() * endMsgs.length)]
        if (curText === text)
          return
        curText = text
        btn.color = '#ff655a'
        btn.tooltip = btn.text = text
        btn.show()
      }

      run()
      setTimeout(() => {
        isRun = false
      }, 60000)
      return
    }

    if (nowMinutes > MIN_18_10 && nowMinutes <= MIN_20_00) {
      stopStatusAnimation()
      const text = '小伙子怎么回事，还不下班，难道领导给你加班费？ 🤔️'
      if (curText === text)
        return
      curText = text
      btn.tooltip = btn.text = text
      btn.color = '#ff9af4'
      btn.show()

      if (trigger === 'typing') {
        message.info({
          message: text,
          buttons: ['有加班费', '没有'],
        }).then((res) => {
          if (res === '有加班费') {
            message.info('那就好，加油吧～')
            const text = '真令人羡慕有加班费的人～ 😍'
            btn.tooltip = btn.text = text
            btn.color = '#eec9ed'
            btn.show()
          }
          else {
            message.info('没加班费，还不赶紧滚回家～')
            const text = '最讨厌你这种卷王了～ 😠'
            btn.color = '#eec9c9'
            btn.tooltip = btn.text = text
            btn.show()
          }
        })
      }

      return
    }

    if (nowMinutes > MIN_20_00) {
      stopStatusAnimation()
      if (isRun)
        return
      const run = () => {
        isRun = true
        const text = endMsgs[Math.floor(Math.random() * endMsgs.length)]
        if (curText === text)
          return
        curText = text
        btn.color = '#ff655a'
        btn.tooltip = btn.text = text
        btn.show()
      }

      run()
      setTimeout(() => {
        isRun = false
      }, 60000)

      const text = warningMsgs[Math.floor(Math.random() * warningMsgs.length)]
      curText = text
      btn.tooltip = btn.text = text
      btn.show()
      btn.color = '#e90101'
      if (trigger === 'typing')
        message.info(text)
      return
    }

    applyEnabledState()
  }

  const commandMenuDisposable = vscode.commands.registerCommand(COMMAND_MENU, async () => {
    const items: Array<{ label: string, command: string, args?: unknown[] }> = []

    items.push({
      label: careConfig.enabled ? 'Pause vscode-care' : 'Resume vscode-care',
      command: COMMAND_TOGGLE_ENABLED,
    })

    if (isSnoozed()) {
      items.push({ label: 'Resume notifications', command: COMMAND_RESUME })
    }
    else {
      items.push({ label: 'Snooze 10 minutes', command: COMMAND_SNOOZE_10M })
      items.push({ label: 'Snooze 30 minutes', command: COMMAND_SNOOZE_30M })
      items.push({ label: 'Snooze 60 minutes', command: COMMAND_SNOOZE_60M })
    }

    items.push({ label: 'Open today report', command: COMMAND_OPEN_REPORT })
    items.push({ label: 'Allow coding today', command: COMMAND_ALLOW_TODAY })
    items.push({ label: 'Open settings', command: 'workbench.action.openSettings', args: ['vscode-care'] })
    const picked = await vscode.window.showQuickPick(items, { title: 'vscode-care' })
    if (!picked)
      return
    void vscode.commands.executeCommand(picked.command, ...(picked.args || []))
  })

  const commandToggleDisposable = vscode.commands.registerCommand(COMMAND_TOGGLE_ENABLED, () => {
    careConfig = {
      ...careConfig,
      enabled: !careConfig.enabled,
    }
    void vscode.workspace.getConfiguration('vscode-care').update('enabled', careConfig.enabled, true)
    applyEnabledState()
    runCare('timer')
  })

  const commandSnooze10Disposable = vscode.commands.registerCommand(COMMAND_SNOOZE_10M, () => {
    setSnooze(10, context)
    runCare('timer')
  })

  const commandSnooze30Disposable = vscode.commands.registerCommand(COMMAND_SNOOZE_30M, () => {
    setSnooze(30, context)
    runCare('timer')
  })

  const commandSnooze60Disposable = vscode.commands.registerCommand(COMMAND_SNOOZE_60M, () => {
    setSnooze(60, context)
    runCare('timer')
  })

  const commandResumeDisposable = vscode.commands.registerCommand(COMMAND_RESUME, () => {
    resumeSnooze(context)
    runCare('timer')
  })

  const commandAllowTodayDisposable = vscode.commands.registerCommand(COMMAND_ALLOW_TODAY, () => {
    allowCodingToday(context, getDateKey())
    message.info('今天已允许继续 coding ✅')
    runCare('timer')
  })

  const commandOpenReportDisposable = vscode.commands.registerCommand(COMMAND_OPEN_REPORT, () => {
    openReport()
  })

  applyEnabledState()
  runCare('timer')

  const configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
    if (!e.affectsConfiguration('vscode-care'))
      return
    careConfig = readConfig()
    applyEnabledState()
    runCare('timer')
  })

  return [
    configDisposable,
    commandMenuDisposable,
    commandToggleDisposable,
    commandSnooze10Disposable,
    commandSnooze30Disposable,
    commandSnooze60Disposable,
    commandResumeDisposable,
    commandAllowTodayDisposable,
    commandOpenReportDisposable,
    addEventListener('text-change', e => runCare('typing', e.reason)),
  ]
}, () => {
  stopAllTimers()

  if (extensionContext && lastDateKey)
    saveTodayStats(extensionContext, lastDateKey)
})
