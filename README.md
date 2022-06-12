# CampaignJS
Subscribe contacts to predefined campaign actions and send emails, SMSs and any other action based on customizable triggers. Useful for sending emails to contacts, posting to social media and most other scenarios requiring predefined actions being triggered when the conditions is met.

## Prerequisites
* Node 
* Postgres

## Install
`npm install CampaignJS`

## Setup
Instantiate: 
``` js
const CampaignJS = require('CampaignJS')

const contacts = {
  1: { uid: 1, email: 'julie@gmail.com', name: 'Julie Doe' },
  2: { uid: 2, email: 'jane@gmail.com', name: 'Jane Doe' },
}

const MyCampaign = new CampaignJS({
  pgDb: process.env.PGDB,
  getContacts: (contactIds) => contactIds.map(id => contacts[id]),
  contactIdField: 'uid',
  id: 'myCampaign',
  callbacks: {
    helloCallback: (args) => console.log('>> helloCallback', args.contact.email, args))
  },
  actions:[
    {
      id: 'myAction1',
      callback: 'helloCallback',
      params: { msg: 'hello world' },
      trigger: { type: 'once' }
    },
    {
      id: 'myAction2',
      callback: 'helloCallback',
      params: { msg: 'hello again' },
      trigger: { type: 'recurring', intervalDays: 1 }
    },
  ]
})
```
Its also possible to extend and instantiate for convenient reuse.

## Use
* Start processing the campaign steps every intervalMs: `MyCampaign.start()`
* Stop processing: `MyCampaign.stop()`
* Process at will: `MyCampaign.process()`

## Constructor Options
| option | Description |
| --- | --- |
| pgDb | (required) connection string to a postgres database |
| getContacts | (required) callback accepting contactIds and returns an array of contacts that CampaignJS forward to the action callback when invoked. See example above. |
| contactIdField | (required) the contact field that CampaignJS should use to map to. See example above. |
| id | (required) campaign id |
| callbacks | (required) callbacks that actions will invoke. See example above. |
| actions | (required) actions with a trigger type of once or recurring, when triggered will invoke a callback |
| schema | (optional) which schema to use |
| tablePrefix | (optional) name tables with a prefix. Defaults to 'campaign_' |
| intervalMs | (options) how often should the campaign processed. Defaults to 30min in milliseconds. |
