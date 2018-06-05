const request = require('request-promise')
const { parseString } = require('xml2js')
const { from, bindNodeCallback } = require('rxjs')
const { map, mergeMap, filter, toArray } = require('rxjs/operators')
const Telegram = require('telegraf/telegram')
const { abbreviation, signal, area } = require('./abbreviation')

const makeCall = (apiKey) => {
  const dataset = '2hr_nowcast'
  const url = `http://api.nea.gov.sg/api/WebAPI?dataset=${dataset}&keyref=${apiKey}`
  const source = from(request(url))

  return source.pipe(
    mergeMap(res => bindNodeCallback(parseString)(res)),
    map(res => res.channel.item[0]),
    map(res => ({
      weatherForecast: res.weatherForecast[0].area,
      validTime: res.validTime
    })),
    mergeMap(res => from(res.weatherForecast).pipe(
      filter(data => signal.includes(data['$'].forecast)),
      filter(data => area.includes(data['$'].name)),
      map(data => ({ forecast: abbreviation[data['$'].forecast], area: data['$'].name })),
      toArray(),
      map(data => ({ validTime: res.validTime, data }))
    ))
  )
}

const index = (event, context, callback) => {
  const apiKey = process.env.NEA_API
  const token = process.env.BOT_TOKEN
  const channel = process.env.BOT_CHANNEL
  const bot = new Telegram(token)

  const source = makeCall(apiKey).pipe(
    mergeMap(meta => from(meta.data).pipe(
      map(res => `${res.area} - ${res.forecast}`),
      toArray(),
      map(res => {
        const header = `<b>${meta.validTime}</b>`
        res.unshift(header)

        return res
      })
    )),
    mergeMap(res => {
      const opts = { parse_mode: 'HTML' }
      const content = res.join('\n')

      return from(bot.sendMessage(channel, content, opts))
    })
  )

  return source.subscribe(
    (res) => console.log(res),
    (err) => console.log(err.message),
    () => callback(null)
  )
}

module.exports = { makeCall, index }
