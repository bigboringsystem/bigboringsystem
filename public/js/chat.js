/*global io */
'use strict';

(function () {
  var socket = io();
  var count = 0;
  var getChatSessionStorage = window.sessionStorage.getItem('chat');
  var muted = JSON.parse(window.sessionStorage.getItem('muted'));
  var chatEl = document.getElementById('chat');
  var name = '';

  var formatTime = function (date) {
    if (date > 9) {
      return date;
    }

    return '0' + date;
  };

  var setChatMessage = function (data) {
    if (!muted[data.uid]) {
      var p = document.createElement('p');

      var time;
      if (data.timestamp) {
        var date = new Date(data.timestamp);
        var hours = formatTime(date.getHours());
        var minutes = formatTime(date.getMinutes());
        var seconds = formatTime(date.getSeconds());

        time = '[' + hours + ':' + minutes + ':' + seconds + '] ';

        if (data.message.substr(0, 4) === '/me ') {
          p.innerHTML = '<span class="timestamp">' + (time ? time : '') + '</span>' + '<strong>' + data.name + '</strong>' + data.message.substr(3);
        } else {
          p.innerHTML = '<span class="timestamp">' + (time ? time : '') + '</span>' + '<strong>' + data.name + '</strong>' + ': ' + data.message;
        }
      }

      // highlight a username's own name in any message
      var message = data.message;
      if (name) {
        /* Match names that are surrounded on either side by either the
           beginning of the line, whitespace, or the end of a line. Colons
           are allowed after the name on account of autocomplete */
        var regexName = new RegExp('(^|\\s)' + name + ':?($|\\s)', 'g');

        // syntactic sugar to use the matched string as the highlighted name, not the sanitized name
        message = message.replace(regexName, '<span class=\"highlight\">$&</span>');
      }

      p.innerHTML = '<span class="timestamp">' + (time ? time : '') + '</span>' + '<strong>' + data.name + '</strong>' + ': ' + message;

      var shouldScroll = (chatEl.scrollHeight - chatEl.scrollTop === chatEl.clientHeight);
      chatEl.appendChild(p);

      if (shouldScroll) {
        p.scrollIntoView();
      }
      count++;

      if (count > 100) {
        chatEl.removeChild(chatEl.getElementsByTagName('p')[0]);
        count--;
      }
    }
  };

  var autocomplete = function (input) {
    var usersEl = document.getElementById('users');

    if (input.value.length > 0) {
      var lastWord = input.value.split(' ').splice(-1)[0];

      if (lastWord.length === 0) {
        return;
      }

      var inputValueRegexp = new RegExp('^' + lastWord, 'i');
      var userNodes = Array.prototype.concat.apply([], usersEl.childNodes);
      var users = userNodes.map(function (node) {
        return node.textContent;
      });

      var results = users.filter(function(user) {
        return user.match(inputValueRegexp);
      });

      if (results.length > 0) {
        var original = new RegExp(lastWord + '$', 'i');
        input.value = input.value.replace(original, results[0] + ': ');
      }
    }
  };

  if (getChatSessionStorage) {
    JSON.parse(getChatSessionStorage).forEach(function (data) {
      setChatMessage(data);
    });
  }

  document.getElementById('chat-form').onsubmit = function (event) {
    event.preventDefault();
    var message = document.querySelector('#message');
    socket.emit('message', message.value);
    message.value = '';
  };

  document.getElementById('message').onkeydown = function (event) {
    if (event.keyCode === 9) {
      event.preventDefault();
      autocomplete(event.target);
    }
  };

  socket.on('message', function (data) {
    setChatMessage(data);
  });

  socket.on('users', function (data) {
    var userList = document.getElementById('users');
    userList.innerHTML = '';

    for (var user in data) {
      if (!muted[user]) {
        var li = document.createElement('li');
        var userItem = '<a href="/user/' + user + '" target="_blank"' + 'title="' + data[user] + '">' + data[user] + '</a>';
        li.innerHTML = userItem;
        userList.appendChild(li);
      }
    }
  });

  socket.on('name', function (data) {
    name = data;
  });

  socket.on('connect', function () {
    socket.emit('user');
  });
})();
