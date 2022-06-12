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

const MyCampaign = new CampaignJS({
  pgDb: process.env.DB_URL,
  getContacts: (contactIds) => contactIds.reduce((map,contactId) => ({ ...map, [contactId]: contacts[contactId] }), {}),
  id: 'myCampaign',
  callbacks: {
    helloCallback: (contact, params) => console.log('>> helloCallback', contact, params))
  },
  actions:[
    {
      id: 'myAction1',
      callback: 'testCallback',
      params: { msg: 'hello world' },
      trigger: { type: 'once' }
    }
  ]
})
```

Or extend and instantiate for convenient reuse:
``` js
const CampaignJS = require('CampaignJS')

class ClientCampaignJS extends CampaignJS{
  constructor({ id, callbacks={}, actions=[] }){
    super({
      pgDb: process.env.DB_URL,
      getContacts: (contactIds) => contactIds.reduce((map,contactId) => ({ ...map, [contactId]: contacts[contactId] }), {}),
      id,
      callbacks,
      actions
    })
  }
}

const MyCampaign = new ClientCampaignJS({
  id: 'myCampaign',
  callbacks: { ... },
  actions:[ ... ]
})

const MyOtherCampaign = new ClientCampaignJS({
  id: 'myOtherCampaign',
  callbacks: { ... },
  actions:[ ... ]
})
```

## Use
* Start processing the campaign steps every intervalMs: `MyCampaign.start()`
* Stop processing: `MyCampaign.stop()`
* Process at will: `MyCampaign.process()`

## Options
....
