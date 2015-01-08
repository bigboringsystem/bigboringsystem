'use strict';

var level = require('level');
var ttl = require('level-ttl');
var conf = require('./conf');

// Load this up once at startup.  Changing DB locations
// mid-process is not supported.
var path = conf.get('db') || './db';

var dbs = {};
var options = {};

// Usage: db('pin') returns the pin db
exports = module.exports = function db (key) {
  if (!dbs[key]) {
    throw new Error('Database not registered: ' + key);
  }
  return dbs[key];
};

exports.register = function (key, opt) {
  if (dbs[key]) {
    throw new Error('Database already registered: ' + key);
  }

  var dbPath = path + '/' + key;
  var db = level(dbPath, {
    createIfMissing: true,
    valueEncoding: 'json'
  });

  if (opt && opt.ttl) {
    db = ttl(db);
  }

  dbs[key] = db;
  options[key] = opt;

  return db;
};
