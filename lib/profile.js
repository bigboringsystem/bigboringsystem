'use strict';

var Boom = require('boom');
var Hoek = require('hoek');
var concat = require('concat-stream');
var csvWriter = require('csv-write-stream');
var accepts = require('accepts');
var conf = require('./conf');

var dbs = require('./db');
var db = dbs.register('profile');

var posts = require('./posts');
var postdb = dbs('posts');

var services = require('./services');
var utils = require('./utils');
var ban = require('./ban');
var pin = require('./pin');

exports.update = function (request, reply) {
  var phone = request.session.get('phone');

  db.get('user!' + phone, function (err, user) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    var name = Hoek.escapeHtml(request.payload.name.trim());

    if (!name || name && name.length < 2) {
      name = '???';
    }

    var userData = {
      name: name,
      websites: request.payload.websites,
      bio: request.payload.bio,
      showreplies: request.payload.showreplies === 'on',
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

exports.updateNameByChat = function (uid, name, next) {
  db.get('uid!' + uid, function (err, phone) {
    if (err) {
      return next(err);
    }

    db.get('user!' + phone, function (err, user) {
      if (err) {
        return next(err);
      }

      var userData = {
        name: name
      };

      user = utils.merge(user, userData);

      db.put('user!' + user.phone, user, function (err) {
        if (err) {
          return next(err);
        }

        next(null);
      });
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
      analytics: conf.get('analytics'),
      session: request.session.get('uid') || false,
      users: users.map(function (user) {
        if (conf.get('ops').indexOf(user.value.uid) > -1) {
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

  all.posts.forEach(function (post) {
    batch.push({
      type: 'del',
      key: post.key
    });
  });

  all.feed.forEach(function (fd) {
    batch.push({
      type: 'del',
      key: fd.key
    });
  });

  postdb.batch(batch, function (err) {
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

    posts.getAllByUser(uid, function (err, all) {
      if (err) {
        return reply(Boom.wrap(err, 500));
      }

      exports.getByUID(uid, function (err, user) {
        if (err) {
          return reply(Boom.wrap(err, 500));
        }

        deletePostsAndUser(all, user, function (err) {
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
  var prehashPhone = utils.fixNumber(request.payload.phone);
  var phone = utils.phoneHash(prehashPhone);

  if (phone === request.session.get('phone')) {
    return reply(Boom.wrap(new Error('You can\'t register your primary phone as your secondary'), 400));
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

        user.secondary[phone] = {
          phone: phone,
          lastTwo: prehashPhone.slice(-2)
        };

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
      pin.generate(prehashPhone, function (err) {
        if (err) {
          return reply(Boom.wrap(err, 400));
        }

        exports.get(request.session.get('phone'), function (err, user) {
          if (err) {
            return reply(Boom.wrap(err, 404));
          }

          var ctx = {
            analytics: conf.get('analytics'),
            phone: prehashPhone,
            user: user
          };

          reply.view('profile', ctx);
        });
      });
    } else {
      // verify PIN
      pin.verify(prehashPhone, request.payload.pin, function (err) {
        if (err) {
          return reply(Boom.wrap(err, 400));
        }

        addSecondary();
      });
    }
  };

  db.get('secondary!' + phone, function (err) {
    if (err) {
      return linkNumber();
    } else {
      return reply(Boom.wrap(new Error('This number is already linked: ' + prehashPhone), 400));
    }
  });
};

exports.exportPosts = function (request, reply) {
  var accept = accepts(request);
  var ext = request.params.ext || ('.' + accept.types(['json', 'csv']));
  if (ext !== '.json' && ext !== '.csv') {
    return reply.redirect('/profile/export.json');
  }

  posts.getAllByUser(request.session.get('uid'), function (err, all) {
    if (err) {
      return reply(err);
    }

    var sanitizedPosts = all.posts.map(function (post) {
      // old posts don't have a postid
      // however, they used to use the timestamp as an id,
      // so we can map it to that
      if (!post.value.postid) {
        post.value.postid = String(post.value.created);
      }
      // Manual CSV encoding doesn't handle arrays or booleans
      delete post.value.replyto;
      delete post.value.showreplies;
      return post.value;
    });

    if (ext === '.csv') {
      var keys = ['uid', 'name', 'created', 'reply', 'content', 'postid'];
      var writer = csvWriter({
        headers: keys
      });

      writer.pipe(concat(function (csv) {
        reply(csv).type('text/csv');
      }));

      sanitizedPosts.forEach(function (post) {
        var vals = keys.map(function (key) {
          return post[key];
        });
        writer.write(vals);
      });
      writer.end();
    } else {
      reply(sanitizedPosts);
    }
  });
};
