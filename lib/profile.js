'use strict';

var level = require('level');
var Boom = require('boom');
var concat = require('concat-stream');
var nconf = require('nconf');

var services = require('./services');
var posts = require('./posts');
var utils = require('./utils');
var ban = require('./ban');
var pin = require('./pin');

nconf.argv().env().file({ file: 'local.json' });

var db;
exports.setDB = function (dbPath) {
  db = level(dbPath || './db/profile', {
    createIfMissing: true,
    valueEncoding: 'json'
  });
};
exports.setDB();

exports.db = function () {
  return db;
};

exports.update = function (request, reply) {
  var phone = request.session.get('phone');

  db.get('user!' + phone, function (err, user) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    var name = request.payload.name.trim();

    if (!name || name && name.length < 2) {
      name = '???';
    }

    var userData = {
      name: name,
      websites: request.payload.websites,
      bio: request.payload.bio,
      phone: phone
    };

    user = utils.merge(user, userData);

    db.put('user!' + phone, user, function (err) {
      if (err) {
        reply(Boom.wrap(err, 400));
      } else {
        request.session.set('name', user.name);
        services.profile(request, reply, user);
      }
    });
  });
};

exports.get = function (phone, next) {
  db.get('user!' + phone, function (err, user) {
    if (err) {
      return next(err);
    }

    next(null, user);
  });
};

exports.ban = function (request, reply) {
  ban.hammer(request.payload.phone, function (err) {
    if (err) {
      reply(Boom.wrap(err, 400));
    }

    reply.redirect('/user/' + request.payload.uid);
  });
};

exports.unban = function (request, reply) {
  ban.unhammer(request.payload.phone, function (err) {
    if (err) {
      reply(Boom.wrap(err, 400));
    }

    reply.redirect('/user/' + request.payload.uid);
  });
};

exports.getAllUsers = function (request, reply) {
  var rs = db.createReadStream({
    gte: 'user!',
    lte: 'user!\xff'
  });

  rs.pipe(concat(function (users) {
    return reply.view('users', {
      analytics: nconf.get('analytics'),
      session: request.session.get('uid') || false,
      users: users.map(function (user) {
        if (nconf.get('ops').indexOf(user.value.uid) > -1) {
          user.op = true;
        }

        return user;
      })
    });
  }));

  rs.on('error', function (err) {
    return reply(Boom.wrap(err, 400));
  });
};

exports.getByUID = function (uid, next) {
  db.get('uid!' + uid, function (err, phone) {
    if (err) {
      return next(err);
    }

    db.get('user!' + phone, function (err, user) {
      if (err) {
        return next(err);
      }

      next(null, user);
    });
  });
};

var deletePostsAndUser = function (all, user, next) {
  var batch = [];

  all.forEach(function (keyPair) {
    batch.push({
      type: 'del',
      key: keyPair.feedKey
    });
    batch.push({
      type: 'del',
      key: keyPair.userKey
    });
  });

  posts.db().batch(batch, function (err) {
    if (err) {
      return next(err);
    }

    batch = [];

    batch.push({
      type: 'del',
      key: 'user!' + user.phone
    });

    batch.push({
      type: 'del',
      key: 'uid!' + user.uid
    });

    db.get('secondaryRef!' + user.phone, function (err, secondary) {
      if (!err) {
        batch.push({
          type: 'del',
          key: 'secondary!' + secondary
        });

        batch.push({
          type: 'del',
          key: 'secondaryRef!' + user.phone
        });
      }

      db.batch(batch, function (err) {
        if (err) {
          return next(err);
        }

        next(null, true);
      });
    });
  });
};

exports.deleteAccount = function (request, reply) {
  if (request.session.get('op')) {
    // delete posts and account
    var uid = request.payload.uid;

    posts.getUserPostKeys(uid, function (err, postKeys) {
      if (err) {
        return reply(Boom.wrap(err, 500));
      }

      exports.getByUID(uid, function (err, user) {
        if (err) {
          return reply(Boom.wrap(err, 500));
        }

        deletePostsAndUser(postKeys, user, function (err, result) {
          if (err) {
            return reply(Boom.wrap(err, 500));
          }

          reply.redirect('/users');
        });
      });
    });
  } else {
    reply.redirect('/');
  }
};

exports.addPhone = function (request, reply) {
  var phone = request.payload.phone;

  if (parseInt(phone, 10) === parseInt(request.session.get('phone'), 10)) {
    return reply(Boom.wrap(new Error("You can't register your primary phone as your secondary"), 400));
  }

  var addSecondary = function () {
    db.put('secondary!' + phone, request.session.get('phone'), function (err) {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      db.put('secondaryRef!' + request.session.get('phone'), phone);

      db.get('user!' + request.session.get('phone'), function (err, user) {
        if (err) {
          return reply(Boom.wrap(err, 500));
        }

        user.secondary[phone] = phone;

        db.put('user!' + request.session.get('phone'), user, function (err) {
          if (err) {
            return reply(Boom.wrap(err, 400));
          }

          reply.redirect('/profile');
        });
      });
    });
  };

  var linkNumber = function () {
    if (!request.payload.pin) {
      // send new PIN
      pin.generate(phone, function (err) {
        if (err) {
          return reply(Boom.wrap(err, 400));
        }

        exports.get(request.session.get('phone'), function (err, user) {
          if (err) {
            return reply(Boom.wrap(err, 404));
          }

          var ctx = {
            analytics: nconf.get('analytics'),
            phone: phone,
            user: user
          };

          reply.view('profile', ctx);
        });
      });
    } else {
      // verify PIN
      pin.verify(phone, request.payload.pin, function (err, pin) {
        if (err) {
          return reply(Boom.wrap(err, 400));
        }

        addSecondary();
      });
    }
  };

  db.get('secondary!' + phone, function (err, primary) {
    if (primary) {
      return reply(Boom.wrap(new Error("This number is already linked: " + phone), 400));
    } else {
      linkNumber();
    }
  });
};
