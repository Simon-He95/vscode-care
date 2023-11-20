export function timeDifference(targetTime: string): string {
  // 获取当前时间
  const currentTime = new Date()

  // 将目标时间和当前时间转换为 Date 对象
  const [targetHour, targetMinute] = targetTime.split(':').map(Number)
  const targetDateTime = new Date()
  targetDateTime.setHours(targetHour, targetMinute, 0, 0)

  // 计算时间差
  const timeDiff = targetDateTime.getTime() - currentTime.getTime()

  // 提取小时、分钟和秒数差异
  const hours = Math.floor(timeDiff / (1000 * 60 * 60))
  const minutes = Math.floor((timeDiff / (1000 * 60)) % 60)
  const seconds = Math.floor((timeDiff / 1000) % 60)

  return `${hours}小时${minutes}分:${seconds}秒`
}

export function getSpecialHoliday() {
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

export function getTime() {
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  return `${hour}:${minute}`
}

export function isOverTime(time: string) {
  const [hour, minute] = time.split(':')
  const [nowHour, nowMinute] = getTime().split(':')
  if (+nowHour > +hour)
    return true
  if (nowHour === hour && +nowMinute > +minute)
    return true
  return false
}

export function getDayOfWeek() {
  const daysOfWeek = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const today = new Date().getDay()
  return daysOfWeek[today]
}

export function isWeekend() {
  return ['星期日', '星期六'].includes(getDayOfWeek())
}
