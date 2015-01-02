'use strict';

(function () {
  var socket = io();
  var count = 0;
  var getChatSessionStorage = window.sessionStorage.getItem('chat');
  var chatEl = document.getElementById('chat');

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

    if (data.message.substr(0,4) == '/me ') {
      p.innerHTML = '<span class="timestamp">' + (time ? time : '') + '</span>' + '<strong>' + data.name + '</strong>' + data.message.substr(3);
    } else {
      p.innerHTML = '<span class="timestamp">' + (time ? time : '') + '</span>' + '<strong>' + data.name + '</strong>' + ': ' + data.message;
    }

    var shouldScroll = (chatEl.scrollHeight - chatEl.scrollTop === chatEl.clientHeight);
    chatEl.appendChild(p);
    if (shouldScroll) {
      p.scrollIntoView();
    }
    count ++;

    if (count > 100) {
      chatEl.removeChild(chatEl.getElementsByTagName('p')[0]);
      count --;
    }
  };

  var httpRequest = new XMLHttpRequest();

  getUserData();

  if (getChatSessionStorage){
    JSON.parse(getChatSessionStorage).forEach( function (data) {
      setChatMessage(data);
    });
  }

  function getUserData() {
    httpRequest.onreadystatechange = setUser;
    httpRequest.open('GET', '/user');
    httpRequest.send();
  }

  document.getElementById('chat-form').onsubmit = function (event) {
    event.preventDefault();
    var message = document.querySelector('#message');
    socket.emit('message', message.value);
    message.value = '';
  };

  socket.on('message', function (data) {
    setChatMessage(data);
  });

  socket.on('users', function (data) {
    var userList = document.getElementById('users');
    userList.innerHTML = '';

    for (var user in data) {
      var li = document.createElement('li');
      var userItem = '<a href="/user/' + user + '">' + data[user] + '</a>';
      li.innerHTML = userItem;
      userList.appendChild(li);
    }
  });

  socket.on('connect', function () {
    getUserData();
  });
})();
