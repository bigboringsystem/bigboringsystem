'use strict';

(function () {
  var socket = io();
  var count = 0;
  var getChatSessionStorage = window.sessionStorage.getItem('chat');
  var unreadMessages = (window.sessionStorage.getItem('unread') || 0);
  var chatArr = [];

  if (getChatSessionStorage){
    JSON.parse(getChatSessionStorage).forEach( function (data) {
      chatArr.push(data);
      count ++;
      if (count > 100) {
        count --;
        chatArr.shift();
      }
    });
  }else {
    window.sessionStorage.setItem('chat', JSON.stringify(chatArr));
  }

  if (window.location.pathname === '/chat') {
    unreadMessages = 0;
    window.sessionStorage.setItem('unread', 0);
  }
  if (unreadMessages > 0) {
    document.querySelector('.chat-link').innerText = 'chat (' + unreadMessages + ')';
  }

  socket.on('message', function (data) {
    chatArr.push(data);
    window.sessionStorage.setItem('chat', JSON.stringify(chatArr));

    if (window.location.pathname !== '/chat') {
      unreadMessages++;
      window.sessionStorage.setItem('unread', unreadMessages);
      document.querySelector('.chat-link').innerText = 'chat (' + unreadMessages + ')';
    }
  });
})();
