const initDb = ({pgDb}) => {
  const Sequelize = require('sequelize')
  return new Sequelize(pgDb, {
    logging: false,
    dialect: 'postgres',
    dialectOptions: {
      dateStrings: true,
    },
    pool: {
      min: 0,
      max: 2,
      idle: 30000,
      acquire: 10000,
    },
  })
}

function initSubs(){
  const { Model, DataTypes } = require('sequelize')
  class Subscribers extends Model{}
  Subscribers.init({
    contact_id: { type: DataTypes.INTEGER, unique: 'unique_subscription', primaryKey: true },
    campaign_id: { type: DataTypes.STRING, unique: 'unique_subscription', primaryKey: true },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
  },{ sequelize: this.Db, schema: this.schema, modelName: this.tablePrefix+'subscribers', freezeTableName: true })
  return Subscribers
}

function initTracks(){
  const { Model, DataTypes } = require('sequelize')
  class Tracks extends Model{}
  Tracks.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    contact_id: { type: DataTypes.INTEGER, allowNull: false },
    campaign_id: { type: DataTypes.STRING, allowNull: false },
    action_id: { type: DataTypes.STRING, allowNull: false },
  },{ sequelize: this.Db, schema: this.schema, modelName: this.tablePrefix+'tracks', freezeTableName: true })
  return Tracks
}

function syncSchema(){
  return this.Subs.sequelize.createSchema(this.schema).catch(e => { if(!e.message.match(/already exists/ig)) throw e })
}

function getTriggeredSubscribers({ action }){

  if(!['once','recurring'].includes(action.trigger.type))
    throw new Error(`unsupported action trigger type ${action.trigger.type}`)

  const SubsTable = this.schema ? `${this.schema}.${this.Subs.tableName}` : this.Subs.tableName
  const tracksTable = this.schema ? `${this.schema}.${this.Tracks.tableName}` : this.Tracks.tableName
  const sqlRecurring = action.trigger.type === 'recurring' ? `and "createdAt" >= NOW() - INTERVAL '${action.trigger.intervalDays} DAY'` : ''
  sql = `
    select * from ${SubsTable} where active = true and "createdAt" < NOW() - INTERVAL '0 DAY' and campaign_id = '${this.id}' and contact_id not in (
      select distinct contact_id from ${tracksTable} where campaign_id = '${this.id}' and action_id = '${action.id}' ${sqlRecurring}
    );
  `
  return this.Db.query(sql).then(([res]) => res)
}

async function getContactsMap(contactIds){
  const contacts = await this.getContacts(contactIds)
  return contacts.reduce((map, contact) => ({ ...map, [contact[this.contactIdField]]: contact }), {})
}

module.exports = class CampaignJS{

  constructor({
    pgDb,
    schema=undefined,
    tablePrefix='campaign_',
    getContacts,
    contactIdField,
    intervalMs=1000 * 60 * 30, //every 30min
    id,
    callbacks={},
    actions=[],
  }){
    // validate input
    if(!pgDb) throw new Error('pgDb required to instantiate CampaignJS')
    if(!getContacts) throw new Error('getContacts required to instantiate CampaignJS')
    if(!contactIdField) throw new Error('contactIdField required to instantiate CampaignJS')
    if(!id) throw new Error('id required to instantiate CampaignJS')

    // assign
    this.schema = schema
    this.tablePrefix = tablePrefix
    this.getContacts = getContacts
    this.contactIdField = contactIdField
    this.intervalMs = intervalMs
    this.id = id
    this.callbacks = callbacks
    this.actions = actions

    // init
    this.Db = initDb({pgDb})
    this.Subs = initSubs.call(this)
    this.Tracks = initTracks.call(this)
  }

  async start(){
    this.stop()
    await this.sync()
    await Promise.all([ this.Subs.sync(), this.Tracks.sync() ])
    this.timer = setInterval(this.process.bind(this, false), this.intervalMs)
  }

  stop(){
    clearInterval(this.timer)
    this.timer = null
  }

  async sync(force=false){
    if(this.schema) await syncSchema.call(this)
    await Promise.all([ this.Subs.sync({ force }), this.Tracks.sync({ force }) ])
  }

  async quit(){
    await this.Db.close()
  }

  async subscribe(contactIds, distributedDays = 1){
    if(distributedDays > contactIds.length) distributedDays = contactIds.length
    const chunkSize = Math.round(contactIds.length / distributedDays)
    const chunks = []
    for (let i = 0; i < contactIds.length; i += chunkSize) {
      chunks.push(contactIds.slice(i, i + chunkSize))
    }

    const moment = require('moment')
    const subs = chunks.map((chunk, index) => chunk.map(contactId => ({
      contact_id: contactId,
      campaign_id: this.id,
      createdAt: moment().add(index, 'days').toDate()
    }))).reduce((list,items) => list.concat(items), [])

    await this.Subs.destroy({ where: { contact_id: contactIds, campaign_id: this.id } })
    await this.Subs.bulkCreate(subs, { ignoreDuplicates: true })
  }

  unsubscribe(contactId){
    return this.Subs.update({ active: false }, { where: { contact_id: contactId, campaign_id: this.id } })
  }

  getSubscribedContactIds(){
    return this.Subs.findAll({ where: { campaign_id: this.id, active: true }}).then(res => res.map(sub => sub.contact_id))
  }

  async process(skipIntervals=true){
    if(!skipIntervals) this.stop()
    for(const action of this.actions){
      const subscribers = await getTriggeredSubscribers.call(this, { action })

      // map and join
      const contacts = await getContactsMap.call(this, subscribers.map(sub => sub.contact_id))
      for(const sub of subscribers){
        if(contacts[sub.contact_id])
          sub.contact = contacts[sub.contact_id]
      }

      // process action
      for(const subscriber of subscribers){
        // TODO: pass more infor
        // TODO: test that the correct contact and info is passed
        await this.callbacks[action.callback](subscriber.contact, action.params)
        await this.Tracks.create({ contact_id: subscriber.contact_id, campaign_id: this.id, action_id: action.id })
      }
    }
    if(!skipIntervals) await this.start()
  }
}
