'use strict';

var level = require('level');
var Boom = require('boom');
var moment = require('moment');
var nconf = require('nconf');

var crypto = require('crypto');
var services = require('./services');
var utils = require('./utils');

nconf.argv().env().file({ file: 'local.json' });

var MAX_POSTS = 10;

var db;
exports.setDB = function (dbPath) {
  db = level(dbPath || './db/posts', {
    createIfMissing: true,
    valueEncoding: 'json'
  });
};

exports.setDB();

var getTime = function () {
  return Math.floor(Date.now() / 1000);
};

exports.db = function () {
  return db;
};

exports.add = function (request, reply) {
  var time = getTime();
  var uid = request.session.get('uid');
  var name = request.session.get('name');

  if (!uid) {
    return reply.redirect('/');
  }

  if (!name) {
    return reply.redirect('/profile');
  }

  var postItem = {
    uid: uid,
    name: name,
    created: time,
    reply: utils.autoLink(request.payload.reply) || '',
    content: utils.autoLink(request.payload.content, {
      htmlEscapeNonEntities: true,
      targetBlank: true
    })
  };

  var postid = time + '-' + crypto.randomBytes(1).toString('hex');

  var getId = function () {
    db.get('post!' + postid, function (er, result) {
      if (result && postid.length > (time.length + 8)) {
        // srsly wtf? math is broken? trillions of active users?
        return reply(Boom.wrap('please try later', 503));
      }

      if (result) {
        postid += crypto.randomBytes(1).toString('hex');
        return getId();
      }

      // got an id that isn't taken!  w00t!
      postItem.postid = postid;
      return savePost();
    });
  };

  var savePost = function () {
    db.put('user!' + request.session.get('uid') + '!' + postid, postItem, function (err, post) {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      db.put('post!' + postid, postItem, function (err) {
        if (err) {
          return reply(Boom.wrap(err, 400));
        }

        reply.redirect('/posts');
      });
    });
  };

  getId();
};

exports.del = function (request, reply) {
  if (request.session && (request.session.get('uid') === request.payload.uid) || request.session.get('op')) {
    var keyArr = request.params.key.split('!');
    var time = keyArr[keyArr.length - 1];

    db.del('post!' + time, function (err) {
      if (err) {
        return reply(Boom.wrap(err, 404));
      }

      db.del('user!' + request.payload.uid + '!' + time);
      reply.redirect('/posts');
    });
  } else {
    reply.redirect('/');
  }
}

var setDate = function (created) {
  return moment(created * 1000).format('MMM Do, YYYY - HH:mm a');
};

exports.get = function (request, reply) {
  db.get(request.params.key, function (err, post) {
    if (err) {
      return reply(Boom.wrap(err, 404));
    }

    post.created = setDate(post.created);

    reply.view('post', {
      analytics: nconf.get('analytics'),
      id: request.params.key,
      session: request.session.get('uid') || false,
      op: request.session.get('op'),
      post: post
    });
  });
};

var queryEdgeKey = function (findOldest, prefix, next) {
  var streamOpts = {
    limit: 1
  };

  if (findOldest) {
    streamOpts.gt = prefix;
  } else {
    streamOpts.lt = prefix + '\xff';
    streamOpts.reverse = true;
  }

  var stream = db.createKeyStream(streamOpts);

  stream.on('error', next);

  var result = null;

  stream.on('data', function (key) {
    result = key;
  });

  stream.on('end', function () {
    next(null, result);
  });
};

var getOldestKey = queryEdgeKey.bind({}, true);
var getNewestKey = queryEdgeKey.bind({}, false);

var queryRecentPosts = function (olderThanStart, prefix, startKey, next) {
  var result = {
    firstKey: null,
    lastKey: null,
    hasNewer: false,
    hasOlder: false,
    posts: []
  };

  var streamOpts = {
    limit: MAX_POSTS + 1
  };

  if (olderThanStart) {
    streamOpts.gt = prefix;
    streamOpts.lt = startKey || prefix + '\xff';
    streamOpts.reverse = true;
  } else {
    streamOpts.gt = startKey || prefix;
    streamOpts.lt = prefix + '\xff';
  }

  var stream = db.createReadStream(streamOpts);

  stream.on('error', next);

  stream.on('data', function (post) {
    if (result.posts.length < MAX_POSTS) {
      post.value.created = setDate(post.value.created);
      result.posts.push(post);
    } else {
      if (olderThanStart) {
        result.hasOlder = true;
      } else {
        result.hasNewer = true
      }
    }
  });

  stream.on('end', function () {
    if (!olderThanStart) {
      result.posts.reverse();
    }

    if (result.posts.length !== 0) {
      result.firstKey = result.posts[0].key;
      result.lastKey = result.posts[result.posts.length - 1].key;
    }

    if (!startKey) {
      next(null, result);
      return;
    }

    (olderThanStart ? getNewestKey : getOldestKey)(prefix, function (err, edgeKey) {
      if (err) {
        next(err);
        return;
      }

      if (olderThanStart) {
        if (result.lastKey !== edgeKey) {
          result.hasNewer = true;
        }
      } else {
        if (result.firstKey !== edgeKey) {
          result.hasOlder = true;
        }
      }

      next(null, result);
    });
  });
};

var getPostsOlderThan = queryRecentPosts.bind({}, true);
var getPostsNewerThan = queryRecentPosts.bind({}, false);

var getRecentPosts = function (prefix, request, next) {
  var query = getPostsOlderThan;
  var startKey;

  if (request.query.last) {
    startKey = request.query.last;
  } else if (request.query.first) {
    startKey = request.query.first;
    query = getPostsNewerThan;
  }

  query(prefix, startKey, function (err, result) {
    if (err) {
      next(err);
    } else {
      next(null, result);
    }
  });
};

exports.getRecentByUser = function (uid, request, next) {
  getRecentPosts('user!' + uid + '!', request, next);
};

var showRecentResult = function (view, request, reply, err, result) {
  if (err) {
    reply(Boom.wrap(err, 400));
    return;
  }

  reply.view(view, {
    firstKey: result.firstKey || '',
    lastKey: result.lastKey || '',
    hasNewer: result.hasNewer,
    hasOlder: result.hasOlder,
    posts: result.posts,
    analytics: nconf.get('analytics'),
    session: request.session.get('uid'),
  });
};

exports.showRecentByUser = function (request, reply) {
  var uid = request.session.get('uid');
  exports.getRecentByUser(uid, request, showRecentResult.bind({}, 'posts', request, reply));
};

exports.showRecentPosts = function (request, reply) {
  getRecentPosts('post!', request, showRecentResult.bind({}, 'discover', request, reply));
};

exports.getUserPostKeys = function (uid, next) {
  var stream = db.createKeyStream({
    gte: 'user!' + uid,
    lte: 'user!' + uid + '\xff'
  });

  stream.on('error', next);

  var keys = [];

  stream.on('data', function (key) {
    keys.push({
      userKey: key,
      feedKey: 'post!' + key.split('!')[2]
    });
  });

  stream.on('end', function () {
    next(null, keys);
  });
};
