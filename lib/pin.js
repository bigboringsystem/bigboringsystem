'use strict';

var Boom = require('boom');
var twilio = require('./twilio');
var conf = require('./conf');
var fixtures = require('../test/fixtures.json');
var client = twilio(conf.get('twilioSID'), conf.get('twilioToken'));
var db = require('./db').register('pins');

exports.verify = function (phone, pin, next) {
  if (process.env.NODE_ENV !== 'test' && process.env.npm_lifecycle_event !== 'dev') {
    db.get('pin!' + phone, function (err, foundPin) {
      db.del('pin!' + phone);

      if (err || foundPin !== pin) {
        return next(new Error('Invalid pin'));
      }

      next(null, pin);
    });
  } else {
    if (parseInt(fixtures.pin, 10) !== parseInt(pin, 10)) {
      return next(new Error('Invalid pin'));
    }

    next(null, fixtures.pin);
  }
};

exports.generate = function (phone, next) {
  var pin = Math.floor(Math.random() * (10000 - 1111 + 1) + 1111);

  // 5 minutes max TTL
  db.put('pin!' + phone, pin, { ttl: 300000 }, function (err) {
    if (err) {
      return next(err);
    }

    client.sendMessage({
      to: phone,
      from: '+' + conf.get('twilioNumber'),
      body: pin
    }, function (err) {

      if (err) {
        console.error(err);
        return next(Boom.wrap(new Error(err.message), err.status));
      }

      next(null, true);
    });
  });
};
