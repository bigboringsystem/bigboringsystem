'use strict';

var profile = require('./profile');
var Hoek = require('hoek');

exports.commands = function (user, msg, next) {
  var available = 'name, me';

  var data = {
    private: false,
    name: '',
    message: ''
  };

  var spaceIndex = msg.indexOf(' ');
  var comm = msg.substr(1, (spaceIndex > 0 ? spaceIndex - 1 : undefined));
  var arg = spaceIndex > 0 ? msg.substr(spaceIndex + 1) : '';

  if (!comm.length)  {
    return next(data);
  }

  switch(comm) {
    case 'name':
      var name = Hoek.escapeHtml(arg.trim());

      if (!name || name && (name.length < 2 || name.length > 30)) {
        data.private = true;
        data.message = '<i>error: name ' + name + ' does not meet requirements</i>';

        return next(data);
      }

      profile.updateNameByChat(user.uid, name, function (err) {
        if (err) {
          data.private = true;
          data.message = '<i>error: something went wrong, speak with an op</i>';

          return next(data);
        }

        data.name = name;
        data.message = '<i>' + user.user + ' changed name to ' + name + '</i>';

        console.log('user ' + user.uid + ' changed name to ' + name);
        next(data);
      });

      break;
    case 'me':
      data.message = '<i>' + user.user + ' ' + arg + '</i>';

      next(data);
      break;
    case 'help':
      data.private = true;
      data.message = '<i>commands: ' + available + '</i>';

      next(data);
      break;
    default:
      data.private = true;
      data.message = '<i>error: command /' + comm + ' not found, see /help</i>';

      next(data);
  }
};
