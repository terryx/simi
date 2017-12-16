const AWS = require('aws-sdk')
const request = require('request-promise')
const geolib = require('geolib')
const { Observable } = require('rxjs')
const { isEmpty } = require('lodash')
const { convertXMLtoJSON } = require('../utils/datatype')
const abbreviation = require('./abbreviation')
const { profiles } = require('../config/weather')()

const getWeatherReport = (dataset) => {
  return request({
    method: 'get',
    uri: 'http://api.nea.gov.sg/api/WebAPI',
    qs: {
      keyref: process.env.APIKEY,
      dataset
    }
  })
  .then(response => convertXMLtoJSON(response))
  .then(data => data.channel.item[0])
}

const filterRainingArea = (location, areas) => {
  return Observable
    .from(areas)
    .filter(area => {
      const circle = { latitude: area['$'].lat, longitude: area['$'].lon }

      return geolib.isPointInCircle(location, circle, parseInt(process.env.RADIUS))
    })
    .mergeMap(response => {
      const location = response['$']
      const { forecast, name } = location

      if (forecast.includes(abbreviation.rain)) {
        return Observable.of({ forecast: abbreviation.abbreviation[forecast], name })
      }

      return Observable.empty()
    })
    .toArray()
}

const index = (event, context, callback) => {
  if (!event) {
    event = {}
  }

  return Observable
    .fromPromise(getWeatherReport('2hr_nowcast'))
    .mergeMap(response => {
      const { validTime, weatherForecast } = response
      const areas = weatherForecast[0].area
      return Observable
        .from(profiles)
        .map(profile => {
          return { profile, areas, validTime }
        })
    })
    .mergeMap(response => {
      return Observable.zip(
        filterRainingArea(response.profile.home, response.areas),
        filterRainingArea(response.profile.work, response.areas)
      )
      .mergeMap(([home, work]) => {
        const { profile, validTime } = response

        if (!isEmpty(home) && !isEmpty(work)) {
          const message = 'Raining in home and work area around ' + validTime
          return Observable.of({ message, profile })
        }

        if (!isEmpty(home)) {
          const message = 'Home area rainning around ' + validTime
          return Observable.of({ message, profile })
        }

        if (!isEmpty(work)) {
          const message = 'Working place raining around ' + validTime
          return Observable.of({ message, profile })
        }

        return Observable.empty()
      })
    })
    .mergeMap(data => {
      const sns = new AWS.SNS()
      const snsAttributes = {
        attributes: {
          DefaultSenderID: 'Simi',
          DefaultSMSType: 'Promotional'
        }
      }

      return Observable
        .fromPromise(sns.setSMSAttributes(snsAttributes).promise())
        .mergeMap(() => {
          const params = {
            Message: data.message,
            PhoneNumber: data.profile.mobile
          }

          return Observable.fromPromise(sns.publish(params).promise())
        })
    })
    .subscribe({
      next: result => {
        console.log('err', result)
      },
      error: result => {
        console.error(result.message)
      },
      complete: () => {
        context.done(null)
      }
    })
}

module.exports = { index }
