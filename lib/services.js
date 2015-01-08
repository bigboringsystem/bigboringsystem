'use strict';

var conf = require('./conf');
var Boom = require('boom');

var profile = require('./profile');
var posts = require('./posts');
var ban = require('./ban');
var utils = require('./utils');
var fixtures = require('../test/fixtures');

var ctx = {
  analytics: conf.get('analytics')
};

exports.home = function (request, reply) {
  ctx.error = request.query.err || '';
  ctx.session = request.session.get('uid') || false;
  ctx.ops = conf.get('ops') || {};

  if (ctx.ops.length > 0) {
    var count = 0;
    var users = {};

    ctx.ops.forEach(function (op) {
      profile.getByUID(op, function (err, user) {
        count++;
        if (!err && user) {
          users[op] = {
            uid: op,
            name: user.name
          };
        }
        if (count === ctx.ops.length) {
          ctx.ops = users;
          reply.view('index', ctx);
        }
      });
    });
  } else {
    reply.view('index', ctx);
  }
};

exports.links = function (request, reply) {
  ctx.session = request.session.get('uid') || false;
  reply.view('links', ctx);
};

exports.messages = function (request, reply) {
  ctx.session = request.session.get('uid') || false;
  reply.view('messages', ctx);
};

exports.chat = function (request, reply) {
  ctx.session = request.session.get('uid') || false;
  reply.view('chat', ctx);
};

exports.authenticate = function (request, reply) {
  reply.view('authenticate', {
    testPin: fixtures.pin,
    error: request.query.err
  });
};

exports.user = function (request, reply) {
  var uid = request.params.uid;

  var checkBanStatus = function (user, opts) {
    ban.status(user.phone, function (err, status) {
      if (err) {
        status = false;
      }

      reply.view('user', {
        firstKey: opts.firstKey,
        lastKey: opts.lastKey,
        next: opts.paginate,
        analytics: ctx.analytics,
        user: user.name,
        banned: status,
        uid: user.uid,
        websites: utils.autoLink(user.websites),
        bio: utils.autoLink(user.bio),
        session: request.session.get('uid'),
        posts: opts.posts,
        phone: request.session.get('op') ? user.phone : false,
        op: request.session.get('op'),
        userOp: conf.get('ops').indexOf(user.uid) > -1 || false
      });
    });
  };

  profile.getByUID(uid, function (err, user) {
    if (err) {
      return reply(Boom.wrap(err, 404));
    }

    posts.getRecentForUser(uid, request, function (err, opts) {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      checkBanStatus(user, opts);
    });
  });
};

exports.profile = function (request, reply) {
  var context = {
    error: request.query.err || '',
    session: request.session.get('uid') || false,
    op: request.session.get('op') || false,
    phone: '',
    analytics: ctx.analytics
  };

  if (request.session.get('phone')) {
    profile.get(request.session.get('phone'), function (err, user) {
      if (err) {
        return reply(Boom.wrap(err, 404));
      }

      context.user = user;
      reply.view('profile', context);
    });
  } else {
    reply.view('profile', context);
  }
};

exports.privacy = function(request, reply) {
    reply.view('privacy');
};
