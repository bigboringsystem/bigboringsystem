/*global io */
'use strict';

(function () {
  var MONTHS = 'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec'.split('_');
  var socket = io();
  var count = 0;
  var getChatSessionStorage = window.sessionStorage.getItem('chat');
  var chatArr = [];
  var timeEls = document.querySelectorAll('time[datetime]');
  var ordinal = function (number) {
      var b = number % 10,
          output = (+(number % 100 / 10) === 1) ? 'th' :
          (b === 1) ? 'st' :
          (b === 2) ? 'nd' :
          (b === 3) ? 'rd' : 'th';
      return number + output;
  };
  var zeroFill = function (number) {
    return ((number < 10) ? '0' : '') + number;
  };
  var localDate = function (timestamp) {
    var d = new Date(timestamp);
    var hour = d.getHours();
    return MONTHS[d.getMonth()] + ' ' + ordinal(d.getDate()) + ', ' + d.getFullYear() + ' - ' +
      (hour % 12 || 12) + ':' + zeroFill(d.getMinutes()) + ' ' + (hour % 12 === hour ? 'am' : 'pm');
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
