'use strict';

var textarea = document.querySelector('textarea');
var form = document.querySelector('form');

var qs = window.queryString.parse(location.search);

var port = location.port ? ':' + location.port : '';

if (qs.reply_to) {
  var replyto = document.querySelector('#reply-to');
  var protocol = location.protocol;
  var hostname = location.hostname;
  var postid = qs.reply_to;

  replyto.value = protocol + '//' + hostname + port + '/post/' + postid;
}

var submitPost = function (e) {
  if (e.keyCode === 13 && (e.metaKey || e.ctrlKey)) {
    form.submit();
  }
};

textarea.addEventListener('keydown', submitPost, false);
