const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const dns = require('dns')
const mongoose = require('mongoose')
const uuid = require('uuid/v4')

const app = express()
app.use(cors({optionSuccessStatus: 200}))
app.use('/web/pages', express.static(process.cwd()+'/web/pages'))
app.use(bodyParser.urlencoded({ extended: false }))

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
mongoose.connection.once('open', () =>
  console.log("Connection Successful!")
)

/*
 Timestamp project
 ***************************************************************/
app.get('/api/timestamp/:date_string?', (req, res) => {
  const date = req.params.date_string
    ? isNaN(+req.params.date_string)
      ? new Date(req.params.date_string)
      : new Date(+req.params.date_string)
    : new Date()
  isNaN(date)
    ? res.json({ error: 'Invalid Date' })
    : res.json({
      unix: date.getTime(),
      utc: date.toUTCString()
    })
})

/*
 Header project
***************************************************************/
app.get('/api/header', (req, res) => {
  res.json({
    ipaddress: req.ip,
    language: req.get("Accept-Language"),
    software: req.get("User-Agent")
  })
})

/*
 URL Shortener Microservice
***************************************************************/
const urlSchema = new mongoose.Schema({
  original: String,
  short: String,
  date: Date
})
const urlModel = mongoose.model('urlModel', urlSchema)


app.get('/api/shorturl/new', (req, res) => {
  res.sendFile(process.cwd()+'/web/pages/shortener.html')
})
app.post('/api/shorturl/new', (req, res) => {
  const url = req.body.url
    .replace('http://', '')
    .replace('https://', '')

  dns.lookup(url, (err, data) => {
    if (err) res.json({ error: 'Invalid URL' })
    else {
      const resObj = createNewShortUrl(req.body.url)
      const entry = new urlModel(resObj)
      entry.save()
      flushOldData()
      res.json(resObj)
    }
  })
})

function createNewShortUrl (longURL) {
  return ({
    original: longURL,
    short: uuid().slice(0,8),
    date: new Date()
  })
}

app.get('/api/shorturl/:short', (req, res) => {
  const { params } = req
  const { short } = params

  urlModel.findOne({ short }, (err, data) => {
    if (err) res.redirect('/api/shorturl/new')
    const url = data.original.includes('http://') || data.original.includes('http://')
      ? data.original
      : 'http://' + data.original
    res.redirect(url)
  })
})

/*
  As a protective measure in order to avoid exploits, every time
  data is entered, we delete anyone older than 2 minutes.
*/
function flushOldData () {
  const oldEntries = urlModel.deleteMany({
    date: { $lt: addMinutes( new Date(), -2 ) }
  }, function (err, data) {
    if (err) console.log('Error deleting old files.')
    else console.log(`Old files deleted.`, JSON.stringify(data))
  })
}

function addMinutes (date, minutes) {
  return new Date(date.getTime() + minutes * 60000)
}

/*
 Exercise tracker
***************************************************************/
const exerciseSchema = new mongoose.Schema({
  description: String,
  duration: Number,
  date: Date,
  creationTime: Date
})
const personSchema = new mongoose.Schema({
  name: String,
  userId: String,
  exercises: [exerciseSchema],
  creationTime: Date
})

const personModel = mongoose.model('personModel', personSchema)
const exerciseModel = mongoose.model('exerciseModel', exerciseSchema)

// Homebase: send ui page
app.get('/api/exercise/', (req, res) =>
  res.sendFile(process.cwd()+'/web/pages/exercise_tracker.html')
)

const replaceAll = (text, remove, add) => text.replace(new RegExp(remove, 'g'), add)

// Adds a new person
app.post('/api/exercise/new-user', (req, res) => { //res.send('adds new user {username}, get obj user'))
  const { body } = req
  const { username } = body

  const newPerson = ({
    name: username,
    exercises: [],
    userId: replaceAll(uuid(), '-', ''),
    creationTime: new Date()
  })

  const entry = new personModel(newPerson)
  entry.save()
  res.json(newPerson)
})

// Adds a new exercise to a person
app.post('/api/exercise/add', async (req, res) => { // res.send('ads new exercise {userId, description, duration} [date=now], get obj user with exercises'))
  const { body } = req
  const { userId, duration, date, description } = body

  personModel.findOne({ userId: userId }, async (err, person) => {
    if (err) console.log('error:', err)
    person.exercises = [
      ...person.exercises,
      {
        description,
        date: date || new Date(),
        duration,
        creationTime: new Date()
      }
    ]
    person.save( err => err
      ? console.log(err)
      : console.log('save successful')
    )
    res.json(person)
  })
})

// http://localhost:5000/api/exercise/log?userId=c2e6ea73acac4a78b8b9206dfb356182
// http://localhost:5000/api/exercise/log/:userId/:dateFrom?/:dateTo?/:limit?'

getISODate = dateString => new Date(dateString)//.toISOString()

// Logs a person's exercise list with optional filters
app.get('/api/exercise/log', (req, res) => {

  const { query } = req
  let { userId, dateFrom, dateTo, limit } = query

  dateFrom = '2012-03-05'
  dateTo = '2022-03-05'
  limit = 0

  let filterMatch = { $match: { userId } }
  if (dateFrom)
    safeAppend2(filterMatch, ['$match', 'exercises.date', '$gte', new Date(dateFrom)])
  if (dateTo)
    safeAppend2(filterMatch, ['$match', 'exercises.date', '$lte', new Date(dateTo)])

console.debug('lim', limit)

  personModel.aggregate(
    [
      filterMatch,
      limit ? { $limit: +limit } : null
    ].filter(Boolean),
    function (err, data) {
      if (err)
        console.debug('err', err)
      else {
        let resData
        if (data.length) { // there's a match
          resData = {
            userId: data[0].userId,
            name: data[0].name,
            count: data[0].exercises ? data[0].exercises.length : 0,
            log: data[0].exercises.map(item => ({
              description: item.description,
              duration: item.duration,
              date: item.date
            }))
          }
        }
        res.json(resData)
      }
    }
  )
})



// // Logs a person's exercise list with optional filters
// app.get('/api/exercise/log', (req, res) => { // res.send('gets list of exercise, gets user obj + exercises + exercise count'))
// // app.get('/api/exercise/log/:userId/:dateFrom?/:dateTo?/:limit?', (req, res) => { // res.send('gets list of exercise, gets user obj + exercises + exercise count'))
//   // res.json(req.query)

//   const { query } = req
//   let { userId, dateFrom, dateTo, limit } = query

//   // const filters =  { userId }
//   // if (dateFrom || dateTo) filters.exercises = {}
//   // if (dateFrom && dateTo) filters.exercises.date = {$gte: getISODate(dateFrom), $lte: getISODate(dateTo)}
//   // else if (dateFrom) filters.exercises.date = {$gte: getISODate(dateFrom)}
//   // else if (dateTo) filters.exercises.date = {$lte: getISODate(dateTo)}

//   // console.log('query:', query)
//   // console.log('filters:', filters)
//   // res.json({query: query, filters: filters})

//   dateFrom = '2012-03-05'
//   dateTo = '2022-03-05'

//   let filterMatch = { $match: { userId } }
//   if (dateFrom)
//     safeAppend2(filterMatch, ['$match', 'exercises.date', '$gte', getISODate(dateFrom)])
//   console.debug('filters 1', filterMatch)
//   if (dateTo)
//     safeAppend2(filterMatch, ['$match', 'exercises.date', '$lte', getISODate(dateTo)])

//   console.debug('filters 2', filterMatch)
//   // res.json(filterMatch)
//   personModel.aggregate([
//       filterMatch
//     ], function (err, res) {
//       if (err) console.debug('err', err)
//       else
//       // console.log('res', res)
//       res.json(res || [err])
//     })
// })


safeAppend = (obj, argList, curObj) => {
  if (argList.length) {
    const newList = [...argList]
    const lastItem = newList.pop()
    console.log('pop', lastItem)
    if (!curObj)
      return safeAppend(obj, newList, lastItem)
    else
      return safeAppend(obj, newList, {[lastItem]: curObj})
  }
  return { ...obj, ...curObj}
}

safeAppend2 = (obj, argList) => {
  argList.reduce(safePathReducer, obj)
  // const newargList = [...argList]
  // let curObj = obj
  // let newItem
  // let oldItem
  // let oldObj

  // while (newargList.length > 1) {
  //   oldItem = newItem
  //   newItem = newargList.shift()

  //   if (!curObj[newItem]) curObj[newItem] = {}

  //   oldObj = curObj
  //   curObj = curObj[newItem]
  // }

  // oldObj[newItem] = newargList[0]
}

safePathReducer = (acc, cur, idx, arr) => {
  guardAddProp = (obj, prop) => obj[prop] ? null : obj[prop] = {}

  // If first loop: set up rich accumulator
  if (idx === 0) {
    guardAddProp(acc, cur)
    return { obj: acc, ref: [acc, cur] }
  }

  // Other loops
  else {
    const refObj = acc.ref[0]
    const refProp = acc.ref[1]

    // Regular loops
    if (idx < arr.length - 1) {
      guardAddProp(refObj[refProp], cur)
      return { obj: acc.obj, ref: [refObj[refProp], cur] }
    }

    // Last loop
    else {
      refObj[refProp] = cur
      return acc.obj
    }
  }
}

/*
 Default home
 ***************************************************************/

 app.get("/", function(request, response) {
  response.send('naah');
});

app.listen(
  process.env.PORT
    ? process.env.PORT
    : 8000,
    () =>
      console.log(
        `alive@${process.env.PORT ? process.env.PORT : 8000}`
      )
)