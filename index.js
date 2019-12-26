const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const multer = require('multer')
const upload = multer({ dest: process.cwd() + '/uploads' })
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
  // creationTime: Date,
  // userId: String
})
const personSchema = new mongoose.Schema({
  username: String,
  // userId: String,
  exercises: [exerciseSchema],
  // creationTime: Date
})

const personModel = mongoose.model('personModel', personSchema)
const exerciseModel = mongoose.model('exerciseModel', exerciseSchema)

// Homebase: serve ui page
app.get('/api/exercise/', (req, res) =>
  res.sendFile(process.cwd()+'/web/pages/exercise_tracker.html')
)

const replaceAll = (text, remove, add) => text.replace(new RegExp(remove, 'g'), add)

// Adds a new person
app.post('/api/exercise/new-user', (req, res) => { //res.send('adds new user {username}, get obj user'))
  const { body } = req
  const { username } = body

  const newPerson = ({
    username,
    exercises: [],
    // userId: replaceAll(uuid(), '-', ''),
    // creationTime: new Date()
  })

  const entry = new personModel(newPerson)
  const output = {
    username,
    _id: entry._id,
  }
  entry.save(err => {
    if (err) res.send('Oh, no! It failed... would you try again?')
    res.json(output)
  })
})

// Retrieve all users
app.get('/api/exercise/users', async (req, res) => {
  personModel.find({}, (err, users) => {
    if (err) res.send('Request failed: ' + err)
    
    const output = users.map(user => ({
      username: user.username,
      _id: user._id
    }))
    res.json(output)
  })
})

// Adds a new exercise to a person
app.post('/api/exercise/add', async (req, res) => { // res.send('ads new exercise {userId, description, duration} [date=now], get obj user with exercises'))
  const { body } = req
  const { userId, duration, date, description } = body

  personModel.findOne({ _id: userId }, async (err, person) => {
    if (err) res.send('Failed request:' + err)
    person.exercises = [
      ...person.exercises,
      {
        description,
        duration,
        date: date || new Date()
      }
    ]
    person.save( (err, data) => {
      if (err) res.send('Failed request: ' + err)
      res.json(person)
    })
  })
})

// Logs a person's exercise list with optional filters
app.get('/api/exercise/log', async (req, res) => {

  const { query } = req
  let { userId, from, to, limit } = query
  limit = limit ? parseInt(limit) : null

  console.log('query', query)

  const getPlainUser = async () => 
    personModel.aggregate(
      [{ $match: { _id: mongoose.Types.ObjectId(userId) } }],
      (err, data) => {
        if (err) return (err)
        return data
      }
    )
  
  const getFullData = async () =>
    personModel.aggregate(
      [
        { $match: { _id: mongoose.Types.ObjectId(userId) } },
        { $unwind: '$exercises'},
        from || to
          ? {
            $match: {
              'exercises.date': {
                ...(from ? { $gte: new Date(from) } : null),
                ...(to ? { $lte: new Date(to) } : null),
              }
            }
          }
          : null,
        limit ? { $limit: limit } : null
      ].filter(Boolean),
      (err, data) => {
        if (err) return err
        return data
      }
    )
  
  Promise.all([getPlainUser(), getFullData()])
    .then(data => res.json(beautifyResults(data)))
  
  const beautifyResults = data => ({
    username: data[0][0].username,
    _id: data[0][0]._id,
    exercises: data[1].length
      ? data[1]
        .map(entry => entry.exercises)
        .map(exercise => ({
          description: exercise.description,
          duration: exercise.duration,
          date: exercise.date
        }))
      : []
  })
})

/*
Metadata microservice
****************************************************************/
app.get('/api/metadata/', function (request, response) {
  response.sendFile(process.cwd() + '/web/pages/metadata.html')
})

app.post('/api/metadata/fileanalyse', upload.single('foo'), function (req, res) {
  if (req.file) {
    const output = {
      name: req.file.originalname,
      type: req.file.mimetype,
      size: req.file.size
    }
    res.json(output)
  }
  res.end('oh no')
})
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