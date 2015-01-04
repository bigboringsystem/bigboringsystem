'use strict';

var uuid = require('uuid');
var Boom = require('boom');
var nconf = require('nconf');
var level = require('level');
var ttl = require('level-ttl');
var twilio = require('./twilio');

var fixtures = require('../test/fixtures.json');

nconf.argv().env().file({ file: 'local.json' });

var client = twilio(nconf.get('twilioSID'), nconf.get('twilioToken'));

// TODO(isaacs): factor out db stuff in a DRY way
var db;
exports.setDB = function (dbPath) {
  db = ttl(level(dbPath || './db/pins', {
    createIfMissing: true,
    valueEncoding: 'json'
  }));
};
exports.setDB();

exports.db = function () {
  return db;
};

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
  console.log(pin);

  // 5 minutes max TTL
  db.put('pin!' + phone, pin, { ttl: 300000 }, function (err) {
    if (err) {
      return next(err);
    }

    client.sendMessage({
      to: phone,
      from: '+' + nconf.get('twilioNumber'),
      body: pin
    }, function (err) {
      console.error(err);

      if (err) {
        return next(Boom.wrap(new Error(err.message), err.status));
      }

      next(null, true);
    });

  });
};
