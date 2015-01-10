/*global io */
'use strict';

(function () {
  var socket = io();
  var count = 0;
  var getChatSessionStorage = window.sessionStorage.getItem('chat');
  var chatEl = document.getElementById('chat');

  var httpRequest = new XMLHttpRequest();

  var setUser = function () {
    if (httpRequest.readyState === 4) {
      if (httpRequest.status === 200) {
        console.log(httpRequest.responseText);
        socket.emit('user', JSON.parse(httpRequest.responseText));
      }
    }
  };

  var formatTime = function (date) {
    if (date > 9) {
      return date;
    }

    return '0' + date;
  };

  var setChatMessage = function (data) {
    var p = document.createElement('p');

    var time;
    if (data.timestamp) {
      var date = new Date(data.timestamp);
      var hours = formatTime(date.getHours());
      var minutes = formatTime(date.getMinutes());
      var seconds = formatTime(date.getSeconds());

      time = '[' + hours + ':' + minutes + ':' + seconds + '] ';
    }
    p.innerHTML = '<span class="timestamp">' + (time ? time : '') + '</span>' + '<strong>' + data.name + '</strong>' + ': ' + data.message;
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
  };

  function getUserData() {
    httpRequest.onreadystatechange = setUser;
    httpRequest.open('GET', '/user');
    httpRequest.send();
  }

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
        input.value = input.value.replace(original, results[0]);
      }
    }
  };

  var chatMessageCounter = function ( value ){
    var maxMessageLength = 200;
    var counter = document.getElementById('counter');
    counter.innerHTML = (maxMessageLength - value).toString();
  };

  getUserData();

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

  document.getElementById('message').onkeyup = function ( ) {
    chatMessageCounter(this.value.length);
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
      var li = document.createElement('li');
      var userItem = '<a href="/user/' + user + '" target="_blank">' + data[user] + '</a>';
      li.innerHTML = userItem;
      userList.appendChild(li);
    }
  });

  socket.on('connect', function () {
    getUserData();
  });
})();
