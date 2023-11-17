import { addEventListener, createBottomBar, message } from '@vscode-use/utils'
import type { ExtensionContext } from 'vscode'

const start_work_time = '9:00'
const end_work_time = '18:00'
let curText = ''

export function activate(context: ExtensionContext) {
  const btn = createBottomBar({
    position: 'right',
    text: '',
    tooltip: '',
    color: '',
  })

  const earylyMsgs = [
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
  context.subscriptions.push(addEventListener('text-change', () => {
    if (festival && !once) {
      message.info(festival)
      once = true
    }
    if (isWeekend()) {
      btn.tooltip = btn.text = '你小子，周末也在卷是吧，真要007？'
      btn.color = '#62BAF3'
      btn.show()
      return
    }
    if (!isOverTime(start_work_time) && isOverTime('6:00')) {
      if (isRun)
        return
      const run = () => {
        isRun = true
        const text = earylyMsgs[Math.floor(Math.random() * earylyMsgs.length)]
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
    if (isOverTime(getTime().replace(/\:[0-9]+/, ':30')) && !isOverTime(getTime().replace(/\:[0-9]+/, ':31'))) {
      const text = '喝水时间到了，喝水喝水喝水～ 🍻'
      message.info(text)
    }

    if (isOverTime(start_work_time) && !isOverTime('10:00')) {
      const text = '现在还早，再摸会鱼吧～ 😄'
      if (curText === text)
        return
      curText = text
      btn.color = '#70e5ab'
      btn.tooltip = btn.text = text
      btn.show()
      return
    }

    if (isOverTime('11:30') && !isOverTime('12:00')) {
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
      const [, second] = end_work_time.split(':')
      const [, nowSecond] = getTime().split(':')

      const text = `下班还有${Math.abs(+nowSecond - +second)}分钟下班，加油～ 💪`
      if (curText === text)
        return
      btn.color = '#ea9148'
      curText = text
      btn.tooltip = btn.text = text
      btn.show()
      return
    }

    if (isOverTime(end_work_time) && !isOverTime('18:10')) {
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
  }))
}

export function deactivate() {

}

function getTime() {
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  return `${hour}:${minute}`
}

function isOverTime(time: string) {
  const [hour, minute] = time.split(':')
  const [nowHour, nowMinute] = getTime().split(':')
  if (+nowHour > +hour)
    return true
  if (nowHour === hour && +nowMinute > +minute)
    return true
  return false
}

function getDayOfWeek() {
  const daysOfWeek = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const today = new Date().getDay()
  return daysOfWeek[today]
}

function isWeekend() {
  return ['星期日', '星期六'].includes(getDayOfWeek())
}

function getSpecialHoliday() {
  const today = new Date()
  const month = today.getMonth() + 1 // 月份从 0 开始，需要加1
  const day = today.getDate()

  // 特殊节日的日期，以月份和日期为键值对
  const specialHolidays: any = {
    '1-1': '今天是元旦节 —— 迎接新年，庆祝活动，休假放松。',
    '2-14': '今天是情人节 —— 送礼物、表达爱意，约会，浪漫晚餐。',
    '3-8': '今天是妇女节 —— 表达对女性的尊重和赞美，送花、礼物。',
    '4-1': '今天是愚人节 —— 开玩笑，恶作剧，互相愚弄。',
    '5-1': '今天是劳动节 —— 庆祝劳动者，休假旅游，社区活动。',
    '6-1': '今天是儿童节 —— 关爱儿童，举办儿童活动，赠送礼物。',
    '9-10': '今天是教师节 —— 感谢教师，送花、礼物，致以敬意。',
    '10-1': '今天是国庆节 —— 庆祝国家，观看阅兵、焰火，旅游出游。',
    '12-25': '今天是圣诞节 —— 庆祝耶稣诞生，交换礼物，家庭聚会。',
    // 可以根据需要继续添加其他节日
  }

  const holidayKey = `${month}-${day}`
  return specialHolidays[holidayKey]
}
