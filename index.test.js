const moment = require('moment')
const classFixture = require('./index')

const contacts = {
  1: { uid: 1, email: 'julie@gmail.com', name: 'Julie Doe' },
  2: { uid: 2, email: 'jane@gmail.com', name: 'Jane Doe' },
  3: { uid: 3, email: 'jenny@gmail.com', name: 'Jenny Doe' },
  4: { uid: 4, email: 'jenice@gmail.com', name: 'Jenice Doe' },
}

class TestFixture extends classFixture{
  constructor(id, actions=[]){
    super({
      interval: 1000,
      pgDb: process.env.PGDB,
      schema: 'campaignjs_test',
      tablePrefix: 'test_campaign_',
      getContacts: (contactIds) => contactIds.map(id => contacts[id]),
      contactIdField: 'uid',
      id,
      callbacks:{ testCallback: (options) => this.testCallbackOut.push(options) },
      actions
    })
    this.testCallbackOut = []
  }

  seedSubs(){
    return this.Subs.bulkCreate([
      { contact_id: 1, campaign_id: this.id, active: true },
      { contact_id: 2, campaign_id: this.id, active: true },
      { contact_id: 3, campaign_id: this.id, active: false },
    ], { ignoreDuplicates: true })
  }

  seedTracks(){
    return this.Tracks.bulkCreate([{ contact_id: 2, campaign_id: this.id, action_id: 'action' }])
  }

  inspectSubs(skipAttributes=false){
    const attributes = skipAttributes ? undefined : ['contact_id','active']
    return this.Subs.findAll({ attributes, where: { campaign_id: this.id } }).then(res => res.map(res => res.toJSON()))
  }

  inspectTracks(skipAttributes=false){
    const attributes = skipAttributes ? undefined : ['contact_id', 'campaign_id', 'action_id']
    return this.Tracks.findAll({ attributes, where: { campaign_id: this.id } }).then(res => res.map(res => res.toJSON()))
  }
}

describe(TestFixture.name, () => {

  beforeAll(async () => {
    const client = new TestFixture('test_sync')
    await client.sync()
  })

  afterAll(async () => {
    const client = new TestFixture('test_quit')
    await client.Subs.sequelize.dropSchema(client.schema)
    await client.quit()
  })

  it('should be defined', () => {
    expect(TestFixture).toBeDefined()
  })

  it('should unsubscribe', async () => {
    const client = new TestFixture('test_unsubscribe_1')
    await client.seedSubs()
    await client.unsubscribe(3)
    await client.unsubscribe(2)
    const res = await client.inspectSubs()
    expect(res).toEqual([
      { contact_id: 1, active: true },
      { contact_id: 3, active: false },
      { contact_id: 2, active: false }
    ])
  })

  it('should unsubscribe - correct campaign subscriber', async () => {
    const client1 = new TestFixture('test_unsubscribe_2')
    await client1.seedSubs()
    await client1.unsubscribe(2)
    const client2 = new TestFixture('test_unsubscribe_3')
    await client2.seedSubs()
    await client2.unsubscribe(3)
    const res = [ await client1.inspectSubs(), await client2.inspectSubs() ]
    expect(res).toEqual([
      [
        { contact_id: 1, active: true },
        { contact_id: 3, active: false },
        { contact_id: 2, active: false }
      ],
      [
        { contact_id: 1, active: true },
        { contact_id: 2, active: true },
        { contact_id: 3, active: false }
      ]
    ])
  })

  it('should subscribe', async () => {
    const client = new TestFixture('test_subscribe_1')
    await client.seedSubs()
    await client.subscribe([3])
    const res = await client.inspectSubs()
    expect(res).toEqual([
      { contact_id: 1, active: true },
      { contact_id: 2, active: true },
      { contact_id: 3, active: true }
    ])
  })

  it('should subscribe - correct campaign', async () => {
    const client1 = new TestFixture('test_subscribe_2')
    await client1.seedSubs()
    await client1.unsubscribe(2)
    await client1.subscribe([3])
    const client2 = new TestFixture('test_subscribe_3')
    await client2.subscribe([1])
    const res = [await client1.inspectSubs(), await client2.inspectSubs()]
    expect(res).toEqual([
      [
        { contact_id: 1, active: true },
        { contact_id: 2, active: false },
        { contact_id: 3, active: true }
      ],
      [
        { contact_id: 1, active: true },
      ]
    ])
  })

  it('should subscribe - distributed over 3 days', async () => {
    const client = new TestFixture('test_subscribe_4')
    await client.seedSubs()
    await client.subscribe([1,2,3], 3)
    const res = await client.inspectSubs(true)
    expect(Object.keys(res.reduce((map,item) => ({ ...map, [item.createdAt]: item.createdAt }), {})).length).toEqual(3) //distributed over 3 days
    expect(res.map(({createdAt, updatedAt, campaign_id, ...row}) => row)).toEqual([
      { contact_id: 1, active: true },
      { contact_id: 2, active: true },
      { contact_id: 3, active: true }
    ])
  })

  it('should get subscribed contact ids', async () => {
    const client = new TestFixture('test_getSubscribedContactIds_1')
    await client.subscribe([1,2,3])
    await client.unsubscribe(1)
    const res = await client.getSubscribedContactIds()
    expect(res).toEqual([2,3])
  })

  it('should get subscribed contact ids - correct campaign', async () => {
    const client1 = new TestFixture('test_getSubscribedContactIds_2')
    await client1.subscribe([1,2,3])
    await client1.unsubscribe(1)
    const client2 = new TestFixture('test_getSubscribedContactIds_3')
    await client2.subscribe([1])
    const res = [ await client1.getSubscribedContactIds(), await client2.getSubscribedContactIds() ]
    expect(res).toEqual([ [ 2, 3 ], [ 1 ] ])
  })

  it('should process - once', async () => {
    const client = new TestFixture('test_process_1', [{
      id: 'action',
      callback: 'testCallback',
      params: { msg: 'hello world' },
      trigger: { type: 'once' }
    }])
    await client.subscribe([1,2,3])
    await client.unsubscribe(3)
    await client.seedTracks()
    await client.process()
    await client.process()
    await client.process()
    const res = [ client.testCallbackOut, await client.inspectTracks() ]
    delete res[0][0].subscriber.createdAt
    delete res[0][0].subscriber.updatedAt
    expect(res).toEqual([
      [
        {
          contact: { uid: 1, email: 'julie@gmail.com', name: 'Julie Doe' },
          subscriber: { contact_id: 1, campaign_id: 'test_process_1', active: true },
          campaignId: 'test_process_1',
          action: {
            id: 'action',
            callback: 'testCallback',
            params: { msg: 'hello world' },
            trigger: { type: 'once' }
          }
        }
      ],
      [
        {
          contact_id: 2,
          campaign_id: 'test_process_1',
          action_id: 'action'
        },
        {
          contact_id: 1,
          campaign_id: 'test_process_1',
          action_id: 'action'
        }
      ]
    ])
  })

  it('should process - once correct campaign', async () => {
    const actions = [{
      id: 'action',
      callback: 'testCallback',
      params: { msg: 'hello world' },
      trigger: { type: 'once' }
    }]
    const client1 = new TestFixture('test_process_2', actions)
    await client1.subscribe([1,2,3])
    await client1.seedTracks()
    const client2 = new TestFixture('test_process_3', actions)
    await client2.subscribe([2,4])
    await client2.seedTracks()
    await client1.process()
    await client1.process()
    await client1.process()
    await client2.process()
    await client2.process()
    await client2.process()
    const res = [ await client1.inspectTracks(), await client2.inspectTracks() ]
    expect(res).toEqual([
      [
        {
          contact_id: 2,
          campaign_id: 'test_process_2',
          action_id: 'action'
        },
        {
          contact_id: 1,
          campaign_id: 'test_process_2',
          action_id: 'action'
        },
        {
          contact_id: 3,
          campaign_id: 'test_process_2',
          action_id: 'action'
        }
      ],
      [
        {
          contact_id: 2,
          campaign_id: 'test_process_3',
          action_id: 'action'
        },
        {
          contact_id: 4,
          campaign_id: 'test_process_3',
          action_id: 'action'
        }
      ]
    ])
  })

  it('should process - once considering createdAt', async () => {
    const client = new TestFixture('test_process_4', [{
      id: 'action',
      callback: 'testCallback',
      params: { msg: 'hello world' },
      trigger: { type: 'once' }
    }])
    await client.subscribe([1,2,3,4], 5)
    await client.unsubscribe(3)
    await client.process()
    await client.process()
    await client.process()
    const res = [ await client.inspectSubs(), await client.inspectTracks() ]
    expect(res).toEqual([
      [
        { contact_id: 1, active: true },
        { contact_id: 2, active: true },
        { contact_id: 4, active: true },
        { contact_id: 3, active: false }
      ],
      [
        {
          contact_id: 1,
          campaign_id: 'test_process_4',
          action_id: 'action'
        }
      ]
    ])
  })

  it('should process - recurringly', async () => {
    const client = new TestFixture('test_process_5', [{
      id: 'action',
      callback: 'testCallback',
      params: { msg: 'hello world' },
      trigger: { type: 'recurring', intervalDays: 1 }
    }])

    // seed
    await client.subscribe([1,2,3])
    await client.unsubscribe(3)
    await client.seedTracks()

    // run it
    await client.process()
    await client.process()
    await client.process()

    // inspect
    const res = [await client.inspectTracks()]

    // pastify dates
    await client.Tracks.update({ createdAt: moment().subtract(1, 'days').toDate() }, { where: { campaign_id: client.id } })
    await client.subscribe([3])

    // run it
    await client.process()
    await client.process()
    await client.process()

    // inspect
    res.push(await client.inspectTracks())

    // assert
    expect(res).toEqual([
      [
        {
          contact_id: 2,
          campaign_id: 'test_process_5',
          action_id: 'action'
        },
        {
          contact_id: 1,
          campaign_id: 'test_process_5',
          action_id: 'action'
        }
      ],
      [
        {
          contact_id: 2,
          campaign_id: 'test_process_5',
          action_id: 'action'
        },
        {
          contact_id: 1,
          campaign_id: 'test_process_5',
          action_id: 'action'
        },
        {
          contact_id: 1,
          campaign_id: 'test_process_5',
          action_id: 'action'
        },
        {
          contact_id: 2,
          campaign_id: 'test_process_5',
          action_id: 'action'
        },
        {
          contact_id: 3,
          campaign_id: 'test_process_5',
          action_id: 'action'
        }
      ]
    ])
  })
})
