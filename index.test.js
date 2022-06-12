const ClientClass = require('./index')

const contacts = {
  1: { id: 1, email: 'julie@gmail.com', name: 'Julie Doe' },
  2: { id: 2, email: 'jane@gmail.com', name: 'Jane Doe' },
  3: { id: 3, email: 'jenny@gmail.com', name: 'Jenny Doe' },
  4: { id: 4, email: 'jenice@gmail.com', name: 'Jenice Doe' },
}

const options = {
  pgDb: process.env.PGDB,
  schema: undefined,
  tablePrefix: 'campaign_',
  getContacts: (contactIds) => contactIds.reduce((map,contactId) => ({ ...map, [contactId]: contacts[contactId] }), {}),
  interval: 2000,
}

describe(ClientClass.name, () => {

  beforeAll(async () => {
    const client = new ClientClass({ ...options, id: 'test_synch' })
    await client.sync()
  })

  afterAll(async () => {
    const client = new ClientClass({ ...options, id: 'test_quit' })
    client.stop()
    await client.quit()
  })

  it('should be defined', () => {
    expect(ClientClass).toBeDefined()
  })

  it('should trigger once', async () => {
    const res1 = []
    const client = new ClientClass({ ...options, id: 'test_once_1',
      callbacks: { testCallback: (contact, params) => res1.push({contact, params}) },
      actions:[{ id: 'action', callback: 'testCallback', params: { msg: 'hello world' }, trigger: { type: 'once' } }]
    })
    await client.subscribe([1,2,3])
    await client.unsubscribe(3)
    await client.Tracks.bulkCreate([{ contact_id: 2, campaign_id: client.id, action_id: 'action' }])
    await client.process()
    const res2 = await client.Tracks.findAll({ attributes: ['contact_id', 'campaign_id', 'action_id'], where: { campaign_id: client.id } }).then(res => res.map(res => res.toJSON()))
    await client.Subs.destroy({ where: { campaign_id: client.id } })
    await client.Tracks.destroy({ where: { campaign_id: client.id } })
    expect(res1).toEqual([
      { contact: { id: 1, email: 'julie@gmail.com', name: 'Julie Doe' }, params: { msg: 'hello world' } }
    ])
    expect(res2).toEqual([
      { contact_id: 2, campaign_id: 'test_once_1', action_id: 'action' },
      { contact_id: 1, campaign_id: 'test_once_1', action_id: 'action' }
    ])
  })

  it('should trigger once - considering createdAt', async () => {
    const client = new ClientClass({ ...options, id: 'test_once_2',
      callbacks: { testCallback: (contact, params) => null },
      actions:[{ id: 'action', callback: 'testCallback', params: null, trigger: { type: 'once' } }]
    })
    await client.subscribe([1,2,3,4], 5)
    await client.unsubscribe(3)
    await client.process()
    const res = await client.Tracks.findAll({ attributes: ['contact_id', 'campaign_id', 'action_id'], where: { campaign_id: client.id } }).then(res => res.map(res => res.toJSON()))
    await client.Subs.destroy({ where: { campaign_id: client.id } })
    await client.Tracks.destroy({ where: { campaign_id: client.id } })
    expect(res).toEqual([{ contact_id: 1, campaign_id: 'test_once_2', action_id: 'action' }])
  })

  it('should unsubscribe', async () => {
    const client = new ClientClass({ ...options, id: 'test_unsubscribe_1' })
    await client.Subs.bulkCreate([
      { contact_id: 1, campaign_id: client.id, active: true },
      { contact_id: 2, campaign_id: client.id, active: true },
      { contact_id: 3, campaign_id: client.id, active: false },
    ], { ignoreDuplicates: true })
    await client.unsubscribe(3, client.id)
    await client.unsubscribe(2, client.id)
    const res = await client.Subs.findAll({ attributes: ['contact_id','active'], where: { campaign_id: client.id } }).then(res => res.map(res => res.toJSON()))
    await client.Subs.destroy({ where: { campaign_id: client.id } })
    expect(res).toEqual([
      { contact_id: 1, active: true },
      { contact_id: 3, active: false },
      { contact_id: 2, active: false }
    ])
  })

  it('should subscribe - distributed over days', async () => {
    const client = new ClientClass({ ...options, id: 'test_subscribe_1' })
    await client.Subs.bulkCreate([{ contact_id: 1, campaign_id: client.id, active: false }], { ignoreDuplicates: true })
    await client.subscribe([1,2,3], 3)
    const res1 = await client.Subs.findAll({ attributes: ['contact_id','active','createdAt'], where: { campaign_id: client.id } }).then(res => res.map(res => res.toJSON()))
    await client.Subs.destroy({ where: { campaign_id: client.id } })
    const res2 = res1.map(({createdAt, ...row}) => row)
    const res3 = Object.keys(res1.reduce((map,item) => ({ ...map, [item.createdAt]: item.createdAt }), {}))
    expect(res3.length).toEqual(3) //distributed over 3 diffrent days
    expect(res2).toEqual([
      { contact_id: 1, active: true },
      { contact_id: 2, active: true },
      { contact_id: 3, active: true }
    ])
  })

  it('should subscribe - distributed over days', async () => {
    const client = new ClientClass({ ...options, id: 'test_subscribe_2' })
    await client.Subs.bulkCreate([{ contact_id: 1, campaign_id: client.id, active: false }], { ignoreDuplicates: true })
    await client.subscribe([1,2,3], 1)
    const res1 = await client.Subs.findAll({ attributes: ['contact_id','active','createdAt'], where: { campaign_id: client.id } }).then(res => res.map(res => res.toJSON()))
    await client.Subs.destroy({ where: { campaign_id: client.id } })
    const res2 = res1.map(({createdAt, ...row}) => row)
    const res3 = Object.keys(res1.reduce((map,item) => ({ ...map, [item.createdAt]: item.createdAt }), {}))
    expect(res3.length).toEqual(1) //distributed over 1 diffrent days
    expect(res2).toEqual([
      { contact_id: 1, active: true },
      { contact_id: 2, active: true },
      { contact_id: 3, active: true }
    ])
  })

})
