# big boring system

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

## Ops

Make sure to add yourself as an op in local.json by entering your UID. You can find this on your http://localhost:3000/profile page near the top.
