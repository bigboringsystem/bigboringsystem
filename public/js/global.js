/*global io */
'use strict';

(function () {
  var DAY = /^\w+\s/;
  var MINS_SECS = /(:\d+):\d+/;
  var socket = io();
  var count = 0;
  var getChatSessionStorage = window.sessionStorage.getItem('chat');
  var chatArr = [];
  var timeEls = document.querySelectorAll('time[datetime]');
  var localDate = function (timestamp) {
    var date = new Date(timestamp);
    return date.toDateString().replace(DAY, '') + ' - ' +
      date.toLocaleTimeString().replace(MINS_SECS, '$1').toLowerCase();
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
    [].forEach.call(timeEls, function (timeEl) {
      timeEl.innerText = localDate(timeEl.getAttribute('datetime'));
    });
  }
})();
