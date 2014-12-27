'use strict';

var level = require('level');
var nconf = require('nconf');
var ttl = require('level-ttl');
var twilio = require('twilio');
var twitter = require('twitter-text');
var concat = require('concat-stream');
var Boom = require('boom');

var profile = require('./profile');

nconf.argv().env().file({ file: 'local.json' });

var client = twilio(nconf.get('twilioSID'), nconf.get('twilioToken'))

var db = ttl(level('./db/pins', {
  createIfMissing: true,
  valueEncoding: 'json'
}));

exports.merge = function (objA, objB) {
  for (var key in objB) {
    objA[key] = objB[key];
  }

  return objA;
};

exports.verifyPin = function (phone, pin, next) {
  db.get('pin!' + phone, function (err, foundPin) {
    if (err) {
      return next(err);
    }

    if (foundPin !== pin) {
      next(new Error('Invalid pin'));
    } else {
      db.del('pin!' + phone);
      next(null, pin);
    }
  });
};

exports.generatePin = function (phone, next) {
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

exports.fixNames = function (request, reply) {
  // Shouldn't happen but when it does, a quick way to force a name on one that doesn't exist in an account
  var rs = profile.db().createReadStream({
    gte: 'user!',
    lte: 'user!\xff'
  });

  rs.pipe(concat(function (users) {
    users.forEach(function (user) {
      if (!user.value.name) {
        user.value.name = '???';
      }
      profile.db().put(user.key, user.value);
    });

    reply.redirect('/');
  }));

  rs.on('error', function (err) {
    return reply(Boom.wrap(err, 400));
  });
};

exports.autoLink = function (text, options) {
  if (text && text.toString().trim().length > 0) {
    var entities = twitter.extractEntitiesWithIndices(text, { extractUrlsWithoutProtocol: true });
    return twitter.autoLinkEntities(text, entities, options).replace(/&amp;/gi, '&');
  }
  return '';
};
