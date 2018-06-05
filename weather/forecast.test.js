const test = require('ava')
const forecast = require('./forecast')
const { map } = require('rxjs/operators')

test('NEA http call', t => {
  return forecast.makeCall('xxx')
    .pipe(
      map(res => {
        t.log(res)
        t.pass()
      })
    )
})
