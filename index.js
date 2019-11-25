const express = require('express')
const app = express()
const cors = require('cors')
const bodyParser = require('body-parser')
const dns = require('dns')
const mongoose = require('mongoose')
const uuid = require('uuid/v4')


app.use(cors({optionSuccessStatus: 200}))
app.use('/web/pages', express.static(process.cwd()+'/web/pages'))
app.use(bodyParser.urlencoded({ extended: false }))

mongoose.connect(process.env.MONGO_URI);
mongoose.connection.once('open', () =>
  console.log("Connection Successful!")
)

// Timestamp project
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

// Header project
app.get('/api/header', (req, res) => {
  res.json({
    ipaddress: req.ip,
    language: req.get("Accept-Language"),
    software: req.get("User-Agent")
  })
})

// URL Shortener Microservice
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

/*In order to avoid exploits, as a protective measure, every time
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

// Default home
app.get("/", function(request, response) {
  response.send('naah');
});

app.listen(
  process.env.PORT ? process.env.PORT : 8000, () =>
  console.log(`alive@${process.env.PORT ? process.env.PORT : 8000}`)
)