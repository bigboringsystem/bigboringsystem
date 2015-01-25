'use strict';

var textarea = document.querySelector('textarea');
var form = document.querySelector('form');
var charCountElement = document.querySelector('[name=charcount]');

var qs = window.queryString.parse(location.search);

var port = location.port ? ':' + location.port : '';

var maxPostLength;

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

var updateCharCount = function () {
  var remainingChars = maxPostLength - textarea.value.length;
  if (remainingChars < 0) {
    textarea.value = textarea.value.substring(0, maxPostLength);
    remainingChars = 0;
  }
  charCountElement.className = remainingChars > 0 ? '' : 'error';
  charCountElement.innerHTML = remainingChars;
};

// initialize maxPostLength: read maxLength from textarea
maxPostLength = parseInt(textarea.getAttribute('maxLength'));
if (isNaN(maxPostLength)) {
  maxPostLength = 0;
} else if (maxPostLength > 0) {
  maxPostLength = maxPostLength;
  updateCharCount();
  textarea.addEventListener('keyup', updateCharCount, false);
}


textarea.addEventListener('keydown', submitPost, false);
