'use strict';

var Boom = require('boom');
var concat = require('concat-stream');
var Rss = require('rss');
var conf = require('./conf');

var crypto = require('crypto');
var utils = require('./utils');
var url = require('url');

var MAX_POSTS = 10;

var db = require('./db').register('posts');
var profile = require('./profile');

var internalLinkRe = function () {
  // The better to inline you with...
  var key = '(post![0-9]+-[0-9a-f]+|user![0-9a-f-]{36}![0-9]+-[0-9a-f]+)';
  var pattern = 'https?://[^/\\s]+/post/' + key;
  return new RegExp(pattern);
};

var maxPostLength = conf.get('maxPostLength') ? parseInt(conf.get('maxPostLength')) : 0;

// find replies that look like links to other posts in the system.
// to be "internal" must have this hostname.  If they're actually
// valid posts, then we track stuff.  If not, then we don't bother.
var getInternalLinks = function (reply, host) {
  if (!host) {
    return false;
  }

  reply = reply.trim();
  if (!reply) {
    return false;
  }

  var urls = reply.trim().split(/\s+/);

  var internalLinks = urls.map(function (r) {
    var parsed = r.match(internalLinkRe());
    if (!parsed) {
      return false;
    }

    var u = url.parse(parsed[0]);
    if (u.host === host) {
      // internal link.  Just save the postid.
      return parsed[1].replace(/^(post!|user![^!]+!)(.*)$/, '$2');
    }

    return false;
  }).filter(function (r) {
    return r;
  });

  return internalLinks;
};

var saveReply = function (postItem, next) {
  if (!postItem.replyto) {
    return process.nextTick(next);
  }

  var count = postItem.replyto.length;
  if (!count) {
    return process.nextTick(next);
  }

  var postid = postItem.postid;

  var error;
  var then = function (err) {
    if (err) {
      error = err;
    }

    if (--count <= 0) {
      // filter out any replyto entries that were invalid.
      postItem.replyto = postItem.replyto.filter(function (rt) {
        return rt;
      });

      return next(error);
    }
  };

  postItem.replyto.forEach(function (target, index) {
    // content and replies get big.  We just need a few basics.
    // TODO(isaacs): don't create if author is muted by target author
    // TODO(isaacs): don't create if target is closed to replies
    var replyItem = {
      uid: postItem.uid,
      name: postItem.name,
      created: postItem.created,
      postid: postid,
      target: target
    };

    db.get('post!' + target, function (err, targetPost) {
      if (err) {
        // invalid replyto.  skip, and mark for deletion once we're done.
        postItem.replyto[index] = false;
        return then();
      }

      if (!targetPost.showreplies) {
        postItem.replyto[index] = false;
        return then();
      }

      db.put('replyto!' + target + '!' + postid, replyItem, function (err) {
        then(err);
      });
    });
  });
};

exports.add = function (request, reply) {
  var time = new Date();
  var uid = request.session.get('uid');
  var name = request.session.get('name');

  profile.get(request.session.get('phone'), function (errUser) {
    var err;
    if (errUser) {
      return reply.redirect('/logout');
    }

    if (!uid) {
      return reply.redirect('/');
    }

    if (!name) {
      return reply.redirect('/profile');
    }

    if (!request.payload.content) {
      err = new Error('You must include content with your post');
      return reply(Boom.wrap(err, 400));
    }

    var host = request.headers.host;

    // if maxPostLength has been set in local.json, verfiy that content has not exceeded it.
    if (maxPostLength && request.payload.content.length > maxPostLength) {
      err = new Error('Post content cannot exceed ' + maxPostLength + ' characters');
      return reply(Boom.wrap(err, 400));
    }

    var postItem = {
      uid: uid,
      name: name,
      created: time.toISOString(),
      replyto: getInternalLinks(request.payload.reply, host),
      reply: utils.autoLink(request.payload.reply) || '',
      content: utils.autoLink(request.payload.content, {
        htmlEscapeNonEntities: true,
        targetBlank: true
      }),
      showreplies: request.payload.showreplies === 'on'
    };

    var postid = Math.floor(time / 1000) + '-' + crypto.randomBytes(1).toString('hex');

    var done = function (err) {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }
      reply.redirect('/posts');
    };

    var savePost = function () {
      db.put('user!' + request.session.get('uid') + '!' + postid, postItem, function (err) {
        if (err) {
          return done(err);
        }

        db.put('post!' + postid, postItem, function (err) {
          if (err) {
            return done(err);
          }

          saveReply(postItem, function (err) {
            if (err) {
              return done(err);
            }

            reply.redirect('/posts');
          });
        });
      });
    };

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

    getId();
  });
};

var setPagination = function (defaultKey, request, next) {
  var key;
  var cs = db.createKeyStream({
    gte: defaultKey,
    limit: 1
  });

  cs.on('error', function (err) {
    return next(err);
  });

  cs.on('data', function (data) {
    key = data;
  });

  cs.on('end', function () {
    var streamOpt = {
      gte: defaultKey,
      limit: MAX_POSTS,
      reverse: true
    };

    if (request.query.last) {
      streamOpt.lt = request.query.last;
    } else {
      streamOpt.lte = defaultKey + '\xff';
    }

    return next(null, {
      stream: streamOpt,
      finalKey: key
    });
  });
};

exports.getRss = function (request, reply){
  var feed = new Rss({
    title: 'bbs'
  });

  setPagination('post!', request, function (err, streamOpt) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    var rs = db.createReadStream(streamOpt.stream);
    var domain = conf.get('publicDomain') || 'bigboringsystem.com';

    var port = '';

    if (process.env.NODE_ENV !== 'production') {
      port = ':' + conf.get('port');
    }

    rs.pipe(concat(function (posts) {
      posts.map(function (post) {
        var p = post.value;

        feed.item({
            title: p.created,
            description: p.content,
            url: request.server.info.protocol + '://' + domain + port + '/post/post!' + p.postid,
            author: p.name,
            date: p.created
        });

      });

      return reply(feed.xml()).header('Content-type', 'application/xml');
    }));

    rs.on('error', function (err) {
      return reply(Boom.wrap(err, 400));
    });
  });
};

exports.getAllRecent = function (request, reply) {
  setPagination('post!', request, function (err, streamOpt) {
    if (err) {
      return reply(Boom.wrap(err, 400));
    }

    var rs = db.createReadStream(streamOpt.stream);

    rs.pipe(concat(function (posts) {
      var firstKey = false;
      var lastKey = false;

      if (posts.length) {
        firstKey = posts[0].key;
        lastKey = posts[posts.length - 1].key;
      }

      return reply.view('discover', {
        firstKey: firstKey,
        lastKey: lastKey,
        next: (streamOpt.finalKey !== lastKey),
        analytics: conf.get('analytics'),
        session: request.session.get('uid'),
        posts: posts
      });
    }));

    rs.on('error', function (err) {
      return reply(Boom.wrap(err, 400));
    });
  });
};

exports.getAllByUser = function (uid, next) {
  var rs = db.createReadStream({
    gte: 'user!' + uid,
    lte: 'user!' + uid + '\xff'
  });

  var getFeedPost = function (uid, posts, next) {
    var feedArr = [];
    var count = 0;

    if (posts.length < 1) {
      return next(null, []);
    }

    posts.forEach(function (post) {
      var postid = post.key.split('!')[2];

      var fs = db.createReadStream({
        gte: 'post!' + postid,
        lte: 'post!' + postid + '\xff'
      });

      fs.pipe(concat(function (feed) {
        feed.forEach(function (fd) {
          count++;
          if (fd.value.uid === uid) {
            feedArr.push(fd);
          }

          if (count === feed.length) {
            return next(null, feedArr);
          }
        });
      }));

      fs.on('error', function (err) {
        return next(err);
      });
    });
  };

  rs.pipe(concat(function (posts) {
    getFeedPost(uid, posts, function (err, feed) {
      if (err) {
        return next(Boom.wrap(err, 400));
      }

      return next(null, {
        feed: feed,
        posts: posts
      });
    });
  }));

  rs.on('error', function (err) {
    return next(Boom.wrap(err, 400));
  });
};

exports.getRecent = function (request, reply) {
  var uid = request.session.get('uid');

  profile.getByUID(uid, function (err, user) {
    if (err) {
      // This would mean that the user's acct has been deleted
      // so we should just not show this page anyway.
      return reply.redirect('/logout');
    }

    setPagination('user!' + uid + '!', request, function (err, streamOpt) {
      if (err) {
        return reply(Boom.wrap(err, 400));
      }

      var rs = db.createReadStream(streamOpt.stream);

      rs.pipe(concat(function (posts) {
        var firstKey = false;
        var lastKey = false;

        if (posts.length) {
          firstKey = posts[0].key;
          lastKey = posts[posts.length - 1].key;
        }

        return reply.view('posts', {
          maxPostLength: maxPostLength,
          firstKey: firstKey,
          lastKey: lastKey,
          next: (streamOpt.finalKey !== lastKey),
          analytics: conf.get('analytics'),
          session: uid,
          posts: posts,
          user: user
        });
      }));

      rs.on('error', function (err) {
        return reply(Boom.wrap(err, 400));
      });
    });
  });
};

exports.getRecentForUser = function (uid, request, next) {
  setPagination('user!' + uid + '!', request, function (err, streamOpt) {
    if (err) {
      return next(err);
    }

    var rs = db.createReadStream(streamOpt.stream);

    rs.pipe(concat(function (posts) {
      var firstKey = false;
      var lastKey = false;

      if (posts.length) {
        firstKey = posts[0].key;
        lastKey = posts[posts.length - 1].key;
      }

      next(null, {
        firstKey: firstKey,
        lastKey: lastKey,
        paginate: (streamOpt.finalKey !== lastKey),
        posts: posts
      });
    }));

    rs.on('error', function (err) {
      next(err);
    });
  });
};

exports.delReply = function (request, reply) {
  if (request.session && (request.session.get('uid') === request.payload.uid) || request.session.get('op')) {
    var uid = request.payload.uid;
    var op = request.session.get('op');

    var key = request.params.key;
    var keyArr = key.split('!');
    if (keyArr[0] !== 'replyto') {
      return reply(Boom.wrap, new Error('not found'), 404);
    }

    var target = keyArr[1];

    // verify that either the user is an op, or is the owner
    // of the target post.
    db.get('post!' + target, function (err, postItem) {
      if (err) {
        return reply(Boom.wrap, err, 404);
      }

      if (!op && postItem.uid !== uid) {
        return reply(Boom.wrap, new Error('forbidden'), 403);
      }

      db.del(key, function (err) {
        if (err) {
          return reply(Boom.wrap, err, 400);
        }
        reply.redirect('/post/post!' + target);
      });
    });
  } else {
    reply.redirect('/');
  }
};

exports.del = function (request, reply) {
  if (request.session && (request.session.get('uid') === request.payload.uid) || request.session.get('op')) {
    var deleteKeys = function (keys) {
      var len = keys.length;
      if (len === 0) {
        return reply.redirect('/posts');
      }

      var next = function (err) {
        if (err) {
          return reply(Boom.wrap, err, 404);
        }
        reply.redirect('/posts');
      };

      var error = false;
      keys.forEach(function (key) {
        db.del(key, function (err) {
          if (err) {
            error = err;
          }
          if (--len <= 0) {
            next(error);
          }
        });
      });
    };

    var keyArr = request.params.key.split('!');
    var postid = keyArr[keyArr.length - 1];

    // get the post data first.
    db.get('post!' + postid, function (err, post) {
      if (err) {
        return reply(Boom.wrap, err, 404);
      }

      if (post.uid !== request.payload.uid) {
        return reply(Boom.wrap, new Error('forbidden'), 403);
      }

      var keys = [
        'post!' + postid,
        'user!' + post.uid + '!' + postid
      ];

      if (post.replyto && post.replyto.length) {
        post.replyto.forEach(function (target) {
          keys.push('replyto!' + target + '!' + postid);
        });
      }

      var ks = db.createKeyStream({
        gte: 'replyto!' + postid,
        lte: 'replyto!' + postid + '\xff'
      });

      ks.on('data', function (key) {
        keys.push(key);
      });

      var hadError = false;
      ks.on('error', function (err) {
        hadError = true;
        reply(Boom.wrap, err, 500);
      });

      ks.on('end', function () {
        if (hadError) {
          return;
        }
        deleteKeys(keys);
      });
    });
  } else {
    reply.redirect('/');
  }
};

// TODO(isaacs): Pagination.  Maybe only show the first 100 here,
// but have them all in a top-level "replies" tab?
var getReplyPosts = function (post, next) {
  var streamOpt = {
    gte: 'replyto!' + post.postid,
    lte: 'replyto!' + post.postid + '\xff'
  };

  var replies = [];
  var rs = db.createReadStream(streamOpt);

  rs.on('data', function (reply) {
    var val = reply.value;
    var key = reply.key;

    var replyid = key.match(/^replyto![^!]+!([^!]+)$/);
    if (!replyid) {
      return;
    }
    replyid = replyid[1];
    if (!replyid) {
      return;
    }

    replies.push(val);
  });

  rs.on('end', function () {
    next(null, replies);
  });

  rs.on('error', next);
};

exports.get = function (request, reply) {
  // redirect /post/user!<uid>!<postid> to /post/post!<postid>
  var key = request.params.key;
  var keyparts = key.split('!');
  var postid = keyparts.pop();
  if (keyparts.length !== 1 || keyparts[0] !== 'post') {
    return reply.redirect('/post/post!' + postid).permanent();
  }

  db.get('post!' + postid, function (err, post) {
    if (err) {
      return reply(Boom.wrap(err, 404));
    }

    getReplyPosts(post, function (err, replies) {
      if (err) {
        return reply(Boom.wrap(err, 404));
      }

      post.replies = replies;

      reply.view('post', {
        analytics: conf.get('analytics'),
        id: request.params.key,
        session: request.session.get('uid') || false,
        op: request.session.get('op'),
        post: post
      });
    });
  });
};
