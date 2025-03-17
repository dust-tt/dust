
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./types.cjs.production.min.js')
} else {
  module.exports = require('./types.cjs.development.js')
}
