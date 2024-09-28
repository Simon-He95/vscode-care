import { addEventListener, createBottomBar, createExtension, executeCommand, message } from '@vscode-use/utils'
import { getDayOfWeek, getSpecialHoliday, getTime, isOverTime, isWeekend, timeDifference } from './utils'

const start_work_time = '9:00'
const end_work_time = '18:00'

let curText = ''
let stop: any

let shitTimer: any
const bus = {
  data: [] as (() => void)[],
  emit() {
    this.data.forEach(fn => fn())
  },
  on(fn: () => void) {
    this.data.push(fn)
  },
}
const weekMap: Record<string, boolean> = {}
export = createExtension(() => {
  const locks = [false]
  const btn = createBottomBar({
    position: 'right',
    text: '今天也要元气满满鸭 🦆',
    tooltip: '今天也要元气满满鸭 🦆 ',
    color: '#82c6f7',
  })
  const colors = ['#2ed9b1', '#82c6f7', '#40a9f0', '#a4f6db', '#a6f9fb', '#24e1ec', '#7df8bd']
  let count = 1
  shitTimer = setInterval(() => {
    btn.text = `今天也要元气满满鸭${' '.repeat(6 - count)}🦆${'💩'.repeat(count - 1)}`
    btn.color = colors[count]
    count = count > 5 ? 1 : count + 1
    btn.show()
  }, 500)
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
  bus.on(() => {
    if (shitTimer)
      clearInterval(shitTimer)
  })
  return [
    addEventListener('text-change', (e) => {
      if (e.reason === 1)
        return
      const today = getDayOfWeek()
      for (const key in weekMap) {
        if (key !== today) {
          weekMap[key] = false
        }
      }
      if (festival && !once) {
        message.info(festival)
        once = true
      }
      if (isWeekend()) {
        locks[0] = true
        btn.tooltip = btn.text = '你小子，周末也在卷是吧，真要007？'
        btn.color = '#62BAF3'
        btn.show()
        bus.emit()
        if (!weekMap[today]) {
          executeCommand('undo')
          message.info({
            message: '周末了，不让你 coding，除非你选择继续卷 😠',
            buttons: ['继续卷'],
          }).then((c) => {
            if (c === '继续卷') {
              weekMap[today] = true
            }
          })
        }
        else {
          return
        }
      }
      if (!isOverTime(start_work_time) && isOverTime('6:00')) {
        bus.emit()
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
      if (isOverTime(getTime().replace(/:\d+/, ':30')) && !isOverTime(getTime().replace(/:\d+/, ':31'))) {
        const text = '喝水时间到了，喝水喝水喝水～ 🍻'
        message.info(text)
      }

      if (isOverTime(start_work_time) && !isOverTime('10:00')) {
        const text = '现在还早，再摸会鱼吧～ 😄'
        bus.emit()
        if (curText === text)
          return
        curText = text
        btn.color = '#70e5ab'
        btn.tooltip = btn.text = text
        btn.show()
        return
      }

      if (isOverTime('11:30') && !isOverTime('12:00')) {
        bus.emit()
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

      if (isOverTime('12:00') && !isOverTime('12:30')) {
        bus.emit()
        const text = '你小子中饭也不吃，想卷死我们？😠'
        if (curText === text)
          return
        curText = text
        btn.color = '#4cb4d6'
        btn.tooltip = btn.text = text
        btn.show()
        return
      }

      if (isOverTime('13:00') && !isOverTime('13:30')) {
        bus.emit()
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

      if (isOverTime('17:00') && !isOverTime(end_work_time)) {
        bus.emit()
        if (isCountDown)
          return
        isCountDown = true
        btn.color = '#ea9148'
        stop = setInterval(() => {
          const text = `下班还有${timeDifference(end_work_time)}分钟下班，加油～ 💪`
          curText = text
          btn.tooltip = btn.text = text
          btn.show()
        }, 1000)
        return
      }

      if (stop)
        clearInterval(stop)

      if (isOverTime(end_work_time) && !isOverTime('18:10')) {
        bus.emit()
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

      if (isOverTime('18:10') && !isOverTime('20:00')) {
        bus.emit()
        const text = '小伙子怎么回事，还不下班，难道领导给你加班费？ 🤔️'
        if (curText === text)
          return
        curText = text
        btn.tooltip = btn.text = text
        btn.color = '#ff9af4'
        btn.show()
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
        return
      }

      if (isOverTime('20:00')) {
        bus.emit()
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
        message.info(text)
      }
    }),
  ]
}, () => {
  if (stop)
    clearInterval(stop)
  if (shitTimer)
    clearInterval(shitTimer)
})
