/*global io */
'use strict';

(function () {
  var socket = io();
  var count = 0;
  var getChatSessionStorage = window.sessionStorage.getItem('chat');
  var chatArr = [];

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
})();
