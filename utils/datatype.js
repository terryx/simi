const { parseString } = require('xml2js')

const convertXMLtoJSON = (data) => {
  return new Promise((resolve, reject) => {
    return parseString(data, (err, result) => {
      if (err) {
        return reject(err)
      }

      return resolve(result)
    })
  })
}

module.exports = { convertXMLtoJSON }
