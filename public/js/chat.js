'use strict';

(function () {
  var socket = io();
  var count = 0;
  var getChatSessionStorage = window.sessionStorage.getItem('chat');
  var chatEl = document.getElementById('chat');
  var messageEl = document.getElementById('message');
  var userListArray = [];

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
    p.innerHTML = '<span class="timestamp">'+(time ? time : '')+'</span>' + '<strong>'+data.name+'</strong>' + ': ' + data.message;
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
    socket.emit('message', messageEl.value);
    messageEl.value = '';
  };

  socket.on('message', function (data) {
    setChatMessage(data);
  });

  socket.on('users', function (data) {
    var userList = document.getElementById('users');
    userList.innerHTML = '';
    userListArray = [];

    for (var user in data) {
      var li = document.createElement('li');
      var userItem = '<a href="/user/' + user + '">' + data[user] + '</a>';
      li.innerHTML = userItem;
      userList.appendChild(li);
      userListArray.push(data[user]);
    }
  });

  socket.on('connect', function () {
    getUserData();
  });


  var matchPeople = function (input) {
    var reg = new RegExp(input.split('').join('\\w*').replace(/\W/, ""), 'i');
    return userListArray.filter(function(person) {
      if (person.match(reg)) {
        return person;
      }else {
        return null;
      }
    });
  }

  var autoCompleteHandler = function () {
    var autoCompleteList = document.getElementById('auto-complete');
    autoCompleteList.innerHTML = '';
    if (messageEl.value.length > 0){
      for (var i = 0; i < matchPeople(messageEl.value).length; i++) {
        var matchingUserName = matchPeople(messageEl.value)[i];
        var li = document.createElement('li');
        var listItem = '<a class="matching-item">' + matchingUserName + '</a>';
        li.innerHTML = listItem;
        li.addEventListener('click', function(e){
          e.preventDefault();
          var matchingValue = this.childNodes[0].innerHTML;
          messageEl.value = messageEl.value.replace(/^\S+/g, matchingValue + ': ');
          messageEl.selectionStart = matchingValue.length+2;
          messageEl.selectionEnd = matchingValue.length+2;
          autoCompleteList.innerHTML = '';
          messageEl.focus();
        });
        autoCompleteList.appendChild(li);
      }
    }
    autoCompleteList.addEventListener('mouseover', function(){
      messageEl.blur();
    });
  };

  messageEl.addEventListener("input",  autoCompleteHandler, false);
  messageEl.addEventListener('keyup',  autoCompleteHandler, false);
  messageEl.addEventListener('change', autoCompleteHandler, false);

})();
