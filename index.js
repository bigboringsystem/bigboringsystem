'use strict';

var Hapi = require('hapi');
var conf = require('./lib/conf');
var Boom = require('boom');
var Joi = require('joi');
var SocketIO = require('socket.io');
var http = require('http');
var cookie = require('cookie');
var Iron = require('iron');

var services = require('./lib/services');
var profile = require('./lib/profile');
var auth = require('./lib/auth');
var mute = require('./lib/mute');
var chat = require('./lib/chat');

var posts = require('./lib/posts');
var utils = require('./lib/utils');

var chatUsers = {};
var chatUserCount = 0;

var server = new Hapi.Server();

if (!conf.get('port')) {
  console.error('\n\'port\' is a required local.json field');
  console.error('If you don\'t have a local.json file set up, please copy local.json-dist and fill in your config info before trying again\n');
  process.exit(1);
}

server.connection({
  host: conf.get('domain'),
  port: conf.get('port')
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
    handler: posts.getRecent
  },
  {
    method: 'GET',
    path: '/chat',
    handler: services.chat
  },
  {
    method: 'GET',
    path: '/discover',
    handler: posts.getAllRecent
  },
  {
    method: 'GET',
    path: '/rss',
    handler: posts.getRss
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
    method: 'GET',
    path: '/privacy',
    handler: services.privacy
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
    method: 'GET',
    path: '/profile/export{ext?}',
    handler: profile.exportPosts
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
          bio: Joi.string().allow(''),
          showreplies: Joi.string().allow('')
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
    method: 'POST',
    path: '/reply/{key}',
    handler: posts.delReply
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
  },
  {
    method: 'GET',
    path: '/no_new_accounts',
    handler: services.noNewAccounts
  },
  {
    method: 'POST',
    path: '/mute',
    handler: mute.set
  },
  {
    method: 'POST',
    path: '/unmute',
    handler: mute.unset
  },
  {
    method: 'POST',
    path: '/updatecookie',
    handler: utils.updateCookie,
    config: {
      validate: {
        payload: {
          name: Joi.string().min(2).max(30)
        }
      }
    }
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
         '/deleteaccount', '/post', '/profile/export.json',
         '/profile/export.csv'].indexOf(request.path) > -1) {
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

  var message = error.output.payload.message;
  var statusCode = error.output.statusCode || 500;
  ctx.code = statusCode;
  ctx.httpMessage = http.STATUS_CODES[statusCode].toLowerCase();

  switch (statusCode) {
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

  if (process.env.npm_lifecycle_event === 'dev') {
    console.log(error.stack || error);
  }

  if (ctx.reason) {
    // Use actual message if supplied
    ctx.reason = message || ctx.reason;
    return reply.view('error', ctx).code(statusCode);
  } else {
    ctx.reason = message.replace(/\s/gi, '+');
    reply.redirect(request.path + '?err=' + ctx.reason);
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
    password: conf.get('cookie'),
    isSecure: false,
    clearInvalid: true
  }
};

server.register([{
  register: require('yar'),
  options: options
}, {
  register: require('hapi-cache-buster'),
  options: new Date().getTime().toString()
}], function (err) { });

server.start(function (err) {

  if (err) {
    console.error(err.message);
    process.exit(1);
  }

  console.log('\n  b.b.s. server running at ' + server.info.uri + '  \n');

  var io = SocketIO.listen(server.listener);

  io.on('connection', function (socket) {
    try {
      var cookies = cookie.parse(socket.request.headers.cookie);

      console.log('connected to local socket');

      socket.on('user', function () {
        if (socket.user || socket.uid || !cookies.session) {
          return;
        }

        Iron.unseal(cookies.session, conf.get('cookie'), Iron.defaults, function (err, session) {
          if (err || !session._store) return;

          var user = session._store;

          profile.get(user.phone, function (err) {
            if (err) {
              delete chatUsers[user.uid];
              chatUserCount --;
              return;
            }

            console.log('user connected ', user)
            socket.user = user.name;
            socket.uid = user.uid;
            chatUsers[user.uid] = user.name;
            chatUserCount ++;

            io.emit('users', chatUsers);
            socket.emit('name', user.name);
          });
        });
      });

      socket.on('disconnect', function () {
        console.log('disconnected')

        var userStillConnected = io.sockets.sockets.reduce(function(memo, sock) {
          return memo || sock.uid === socket.uid;
        }, false);
        if (!userStillConnected) {
          delete chatUsers[socket.uid];
        }

        chatUserCount --;
        if (chatUserCount < 0) {
          chatUserCount = 0;
        }

        socket.broadcast.emit('users', chatUsers);
      });

      socket.on('message', function (data) {
        var messageLength = data.trim().length;

        if (socket.user && messageLength > 0 && messageLength < 251) {
          var message = {
            name: socket.user,
            uid: socket.uid,
            timestamp: (new Date()).toISOString(),
            message: utils.autoLink(data, {
              htmlEscapeNonEntities: true,
              targetBlank: true
            }),
            updateCookie: false
          };

          if (data.substr(0, 1) === '/') {
            chat.commands(socket, data, function (result) {
              // if command errors or doesnt require output
              if (!result.message) return;

              // name command settings
              if (result.name) {
                socket.user = chatUsers[socket.uid] = result.name;
                message.updateCookie = true;

                io.emit('users', chatUsers);
                socket.emit('name', result.name);
              }

              // do not append user's name to message
              message.name = false;
              message.message = result.message;

              if (result.private) {
                // only send msg to source
                return socket.emit('message', message);
              }

              io.emit('message', message);
            });
          } else {
            io.emit('message', message);
          }
        }
      });
    } catch (err) { }
  });
});

exports.getServer = function () {
  return server;
};
