'use strict';

var twilio = require('twilio');
var mock = function () {
  return {
    sendMessage: function (options, next) { next(); }
  };
}
var isTest = process.env.NODE_ENV === 'test';
var isDev = process.env.npm_lifecycle_event === 'dev';

if (isTest || isDev) {
  
  module.exports = mock;
  return;

}

module.exports = function (sid, token) {

  if (!sid || !token) {
    console.error('\nTwilio Not Configured:')
    console.error('Please add twilioSID and twilioToken to your local.json config or else use `npm run dev` to run a local dev server instead\n');
    process.exit();
  }

  return twilio(sid, token);

}