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

  var setChatMessage = function (data) {
    var p = document.createElement('p');
    if (data.message.substr(0,4) == '/me ' || data.message.substr(0,4) == '/em ') {
      p.innerHTML =  data.name + data.message.substr(3);
    } else {
      p.innerHTML = data.name + ': ' + data.message;
    }
    chatEl.appendChild(p);
    p.scrollIntoView();
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