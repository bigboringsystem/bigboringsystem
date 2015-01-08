# big boring system

[![Build Status](https://travis-ci.org/bigboringsystem/bigboringsystem.svg)](https://travis-ci.org/bigboringsystem/bigboringsystem) [![Dependency Status](https://david-dm.org/bigboringsystem/bigboringsystem.svg)](https://david-dm.org/bigboringsystem/bigboringsystem)  [![devDependency Status](https://david-dm.org/bigboringsystem/bigboringsystem/dev-status.svg)](https://david-dm.org/bigboringsystem/bigboringsystem#info=devDependencies)

## Feel like contributing?

Please review https://github.com/bigboringsystem/bigboringsystem/blob/master/CONTRIBUTING.md

## Setup

After cloning the repo, install dependencies and copy the local configuration file:

    npm install
    cp local.json-dist local.json

Create a Twilio account. After you create it, go to https://www.twilio.com/user/account/ to get the SID and Auth Token. Enter these into local.json

Make sure that `twilioNumber` in local.json is the full number obtained
from Twilio including the country code. For example, a United States based
number needs to be prefixed by '1' and the area code, i.e. "1NNNNNNNNNN".

Then start the server:

    npm start

Visit http://localhost:3000 in your browser.

## Development Setup

If you are trying to set up b.b.s. for local development only, you can use `npm run dev` instead of `npm start` to bypass certain requirements. For instance:

* You won't need to set up Twilio credentials at all
* In fact, you don't even need to have a local.json file. Dev mode will just use some simple defaults if you don't create one.
* To log into the system, you can go directly to /authenticate and type in the PIN that's listed on the page for you. Or enter a valid-looking phone number on the home page to get to /authenticate, but you'll always use the listed dummy dev PIN.

## Ops

Make sure to add yourself as an op in local.json by entering your UID. You can find this on your http://localhost:3000/profile page near the top.

> This version of [Big Boring System](http://bigboringsystem.com) intentionally has
> no threading. Check [this post][post_no_threading] for more details.

[post_no_threading]: http://bigboringsystem.com/post/user!2c0346c9-6434-41aa-8ee8-4167c1af5b70!1419794369


## Tests

    npm test
