const express = require('express')
const app = express()
const cors = require('cors')

app.use(cors({optionSuccessStatus: 200}))

// Timestamp project
app.get('/api/timestamp/:date_string?', (req, res) => {
  console.log('input:', req.params.date_string)
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

app.get("/", function(request, response) {
  response.send('naah');
});

app.listen(
  process.env.PORT ? process.env.PORT : 8000, () =>
  console.log(`alive@${process.env.PORT ? process.env.PORT : 8000}`)
)