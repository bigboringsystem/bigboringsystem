'use strict';

var crypto = require('crypto');
var conf = require('../lib/conf');
var twitter = require('twitter-text');
var concat = require('concat-stream');
var Boom = require('boom');

var profiledb = require('./db')('profile');

exports.merge = function (objA, objB) {
  for (var key in objB) {
    objA[key] = objB[key];
  }

  return objA;
};


exports.fixNames = function (request, reply) {
  // Shouldn't happen but when it does, a quick way to force a name on one that doesn't exist in an account
  var rs = profiledb.createReadStream({
    gte: 'user!',
    lte: 'user!\xff'
  });

  rs.pipe(concat(function (users) {
    users.forEach(function (user) {
      if (!user.value.name) {
        user.value.name = '???';
      }
      profiledb.put(user.key, user.value);
    });

    reply.redirect('/');
  }));

  rs.on('error', function (err) {
    return reply(Boom.wrap(err, 400));
  });
};

exports.autoLink = function (text, options) {
  if (text && text.toString().trim().length > 0) {
    if (!options) {
      options = {};
    }
    options.htmlEscapeNonEntities = true;
    var entities = twitter.extractEntitiesWithIndices(text, { extractUrlsWithoutProtocol: true });
    return twitter.autoLinkEntities(text, entities, options).replace(/&amp;/gi, '&');
  }
  return '';
};

exports.fixNumber = function (phone) {
  if (phone) {
    if (phone.match(/^[0-9]{10}$/)) {
      phone = '+1' + phone;
    } else if (phone.indexOf('+') !== 0) {
      phone = '+' + phone;
    }
  }

  return phone;
};

exports.phoneHash = function (phone) {
  var salt = conf.get('phoneSalt') || 'default';
  return crypto.createHash('sha1').update(salt + phone).digest('hex');
};

exports.updateCookie = function (request, reply) {
  var name = request.payload.name;
  request.session.set('name', name);

  reply();
};
