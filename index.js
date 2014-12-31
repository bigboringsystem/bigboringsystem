'use strict';

var Hapi = require('hapi');
var nconf = require('nconf');
var Boom = require('boom');
var Joi = require('joi');
var SocketIO = require('socket.io');

var services = require('./lib/services');
var profile = require('./lib/profile');
var auth = require('./lib/auth');

auth.setDB();

var posts = require('./lib/posts');
var utils = require('./lib/utils');

var chatUsers = {};
var chatUserCount = 0;

nconf.argv().env().file({ file: 'local.json' });

var server = new Hapi.Server();

server.connection({
  host: nconf.get('domain'),
  port: nconf.get('port')
});

server.views({
  engines: {
    jade: require('jade')
  },
  isCached: process.env.node === 'production',
  path: __dirname + '/views',
  compileOptions: {
    pretty: true
  }
});

var routes = [
  {
    method: 'GET',
    path: '/',
    handler: services.home
  },
  {
    method: 'GET',
    path: '/user',
    handler: function (request, reply) {
      reply({
        name: request.session.get('name'),
        uid: request.session.get('uid')
      });
    }
  },
  {
    method: 'GET',
    path: '/links',
    handler: services.links
  },
  {
    method: 'GET',
    path: '/users',
    handler: profile.getAllUsers
  },
  {
    method: 'GET',
    path: '/messages',
    handler: services.messages
  },
  {
    method: 'GET',
    path: '/posts',
    handler: posts.showRecentByUser
  },
  {
    method: 'GET',
    path: '/chat',
    handler: services.chat
  },
  {
    method: 'GET',
    path: '/discover',
    handler: posts.showRecentPosts
  },
  {
    method: 'GET',
    path: '/login',
    handler: services.home
  },
  {
    method: 'GET',
    path: '/authenticate',
    handler: services.authenticate
  },
  {
    method: 'POST',
    path: '/authenticate',
    handler: auth.authenticate,
    config: {
      validate: {
        payload: {
          pin: Joi.number().integer()
        }
      }
    }
  },
  {
    method: 'POST',
    path: '/login',
    handler: auth.login,
    config: {
      validate: {
        payload: {
          phone: Joi.string().regex(/^\+?[0-9]+$/).min(10).max(15).options({
            language: {
              label: 'phone number'
            }
          })
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/logout',
    handler: auth.logout
  },
  {
    method: 'GET',
    path: '/user/{uid}',
    handler: services.user
  },
  {
    method: 'GET',
    path: '/profile',
    handler: services.profile
  },
  {
    method: 'POST',
    path: '/profile',
    handler: profile.update,
    config: {
      validate: {
        payload: {
          name: Joi.string().min(2).max(30),
          websites: Joi.string().allow(''),
          bio: Joi.string().allow('')
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/add_phone',
    handler: services.profile
  },
  {
    method: 'POST',
    path: '/add_phone',
    handler: profile.addPhone,
    config: {
      validate: {
        payload: {
          phone: Joi.string().regex(/^\+?[0-9]+$/).min(10).max(16).options({
            language: {
              label: 'phone number'
            }
          }),
          pin: Joi.number().integer().optional()
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/post/{key}',
    handler: posts.get
  },
  {
    method: 'POST',
    path: '/post',
    handler: posts.add
  },
  {
    method: 'GET',
    path: '/ban',
    handler: profile.ban
  },
  {
    method: 'POST',
    path: '/ban',
    handler: profile.ban
  },
  {
    method: 'POST',
    path: '/unban',
    handler: profile.unban
  },
  {
    method: 'POST',
    path: '/post/{key}',
    handler: posts.del
  },
  {
    method: 'GET',
    path: '/fixnames',
    handler: utils.fixNames
  },
  {
    method: 'POST',
    path: '/deleteaccount',
    handler: profile.deleteAccount
  }
];

server.route(routes);

server.route({
  path: '/{p*}',
  method: 'GET',
  handler: {
    directory: {
      path: './public',
      listing: false,
      index: false
    }
  }
});

server.ext('onPreResponse', function (request, reply) {
  var response = request.response;
  if (!response.isBoom) {
    if (['/profile', '/messages', '/chat', '/posts', '/links', '/users',
         '/deleteaccount', '/post'].indexOf(request.path) > -1) {
      if (!request.session.get('uid')) {
        return reply.redirect('/');
      }
    }

    if (['/', '/messages', '/chat', '/posts', '/discover', '/links',
         '/users', '/ban', '/unban', '/deleteaccount', '/post'].indexOf(request.path) > -1) {
      if (request.session.get('uid') && !request.session.get('name')) {
        return reply.redirect('/profile');
      }
    }

    if (['/ban', '/unban', '/fixnames'].indexOf(request.path) > -1) {
      if (!!request.session.get('op') === false) {
        return reply.redirect('/');
      }
    }

    return reply.continue();
  }

  var error = response;
  var ctx = {};

  switch (error.output.statusCode) {
    case 404:
      ctx.reason = 'page not found';
      break;
    case 403:
      ctx.reason = 'forbidden';
      break;
    case 500:
      ctx.reason = 'something went wrong';
      break;
    default:
      break;
  }

  if (ctx.reason) {
    return reply.view('error', ctx);
  } else {
    reply.redirect(request.path + '?err=' + error.output.payload.message.replace(/\s/gi, '+'));
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.register({
    register: require('crumb')
  }, function (err) {
    if (err) {
      throw err;
    }
  });
}

var options = {
  cookieOptions: {
    password: nconf.get('cookie'),
    isSecure: false
  }
};

server.register({
  register: require('yar'),
  options: options
}, function (err) { });

server.start(function () {
  var io = SocketIO.listen(server.listener);

  io.on('connection', function (socket) {
    console.log('connected to local socket');

    socket.on('user', function (user) {
      if (socket.user || socket.uid) {
        return;
      }
      console.log('user connected ', user)
      socket.user = user.name;
      socket.uid = user.uid;
      chatUsers[user.uid] = user.name;
      chatUserCount ++;

      io.emit('users', chatUsers);
    });

    socket.on('disconnect', function () {
      console.log('disconnected')
      delete chatUsers[socket.uid];
      chatUserCount --;

      if (chatUserCount < 0) {
        chatUserCount = 0;
      }

      socket.broadcast.emit('users', chatUsers);
    });

    socket.on('message', function (data) {
      if (socket.user && data.trim().length > 0) {
        io.emit('message', {
          name: socket.user,
          uid: socket.uid,
          timestamp: (new Date()).toISOString(),
          message: utils.autoLink(data, {
            htmlEscapeNonEntities: true,
            targetBlank: true
          })
        });
      }
    });
  });
});

exports.getServer = function () {
  return server;
};
