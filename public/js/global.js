/*global io */
'use strict';

(function () {
  var DATE_FORMAT = 'MMM Do, YYYY - HH:mm a';
  var socket = io();
  var count = 0;
  var getChatSessionStorage = window.sessionStorage.getItem('chat');
  var chatArr = [];
  var timeEls = document.querySelectorAll('time');
  var setDate = function (timestamp) {
    return moment(timestamp).format(DATE_FORMAT);
  };

  if (getChatSessionStorage){
    JSON.parse(getChatSessionStorage).forEach( function (data) {
      chatArr.push(data);
      count++;
      if (count > 100) {
        count--;
        chatArr.shift();
      }
    });
  }else {
    window.sessionStorage.setItem('chat', JSON.stringify(chatArr));
  }

  socket.on('message', function (data) {
    chatArr.push(data);
    window.sessionStorage.setItem('chat', JSON.stringify(chatArr));
  });

  if (timeEls != null) {
    [].slice.call(timeEls).forEach(function (timeEl) {
      timeEl.setAttribute('datetime', timeEl.innerText);
      timeEl.innerText = setDate(timeEl.innerText);
    });
  }
})();
